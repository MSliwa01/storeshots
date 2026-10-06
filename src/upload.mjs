// Uploads output/final/<device>/<locale>/NN-*.png into the editable App Store version:
// replaces the screenshot set of each locale × display type and keeps the file order.
// Without `confirm` it only returns the plan (dry run).
// Credentials, the same variables as the `asc` CLI:
//   ASC_KEY_ID, ASC_ISSUER_ID, and ASC_PRIVATE_KEY_PATH (or the PEM in ASC_PRIVATE_KEY)
// or ASC_CONFIG=<json file with key_id, issuer_id, key_path>.
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CliError, envError, EXIT } from './errors.mjs';

const API = 'https://api.appstoreconnect.apple.com';
const EDITABLE = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'];
const ASC_LOCALES = { en: 'en-US', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', nl: 'nl-NL', pt: 'pt-PT' };
const home = p => p.replace(/^~/, homedir());

/** { keyId, issuerId, pem } from the environment, or null. */
export function ascCredentials(env = process.env) {
  if (env.ASC_CONFIG) {
    const file = home(env.ASC_CONFIG);
    if (!existsSync(file)) throw envError(`ASC_CONFIG points to a missing file: ${file}`);
    const cfg = JSON.parse(readFileSync(file, 'utf8'));
    return { keyId: cfg.key_id, issuerId: cfg.issuer_id, pem: readFileSync(home(cfg.key_path), 'utf8') };
  }
  if (env.ASC_KEY_ID && env.ASC_ISSUER_ID && (env.ASC_PRIVATE_KEY || env.ASC_PRIVATE_KEY_PATH)) {
    return { keyId: env.ASC_KEY_ID, issuerId: env.ASC_ISSUER_ID, pem: env.ASC_PRIVATE_KEY ?? readFileSync(home(env.ASC_PRIVATE_KEY_PATH), 'utf8') };
  }
  return null;
}

let cached;
function token() {
  if (cached && cached.exp - 60 > Date.now() / 1000) return cached.jwt;
  const creds = ascCredentials();
  if (!creds) {
    throw envError('no App Store Connect API key', {
      fix: 'export ASC_KEY_ID, ASC_ISSUER_ID and ASC_PRIVATE_KEY_PATH (App Store Connect → Users and Access → Integrations → Keys)',
    });
  }
  const key = createPrivateKey(creds.pem);
  const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const now = Math.floor(Date.now() / 1000), exp = now + 1100;
  const body = `${b64({ alg: 'ES256', kid: creds.keyId, typ: 'JWT' })}.${b64({ iss: creds.issuerId, iat: now, exp, aud: 'appstoreconnect-v1' })}`;
  const signature = sign('sha256', Buffer.from(body), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  cached = { jwt: `${body}.${signature}`, exp };
  return cached.jwt;
}

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new CliError(`${method} ${path} → ${res.status}`, {
      exit: res.status === 401 || res.status === 403 ? EXIT.ENV : EXIT.UPLOAD,
      detail: text.slice(0, 600),
      fix: res.status === 401 ? 'check ASC_KEY_ID / ASC_ISSUER_ID and that the key is active' : undefined,
    });
  }
  return text ? JSON.parse(text) : {};
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function uploadFile(setId, file) {
  const bytes = readFileSync(file), fileName = file.split('/').pop();
  const reserved = (await api('POST', '/v1/appScreenshots', {
    data: { type: 'appScreenshots', attributes: { fileName, fileSize: bytes.length },
      relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } } },
  })).data;
  for (const op of reserved.attributes.uploadOperations) {
    const headers = Object.fromEntries((op.requestHeaders ?? []).map(h => [h.name, h.value]));
    const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
    if (!res.ok) throw new CliError(`upload part of ${fileName} → ${res.status}`, { exit: EXIT.UPLOAD, detail: (await res.text()).slice(0, 300), fix: 'rerun; finished sets are skipped by checksum' });
  }
  await api('PATCH', `/v1/appScreenshots/${reserved.id}`, {
    data: { type: 'appScreenshots', id: reserved.id, attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') } },
  });
  return reserved.id;
}

async function waitProcessed(ids, log) {
  const deadline = Date.now() + 10 * 60_000;
  const pending = new Set(ids);
  while (pending.size && Date.now() < deadline) {
    for (const id of [...pending]) {
      const state = (await api('GET', `/v1/appScreenshots/${id}`)).data.attributes.assetDeliveryState?.state;
      if (state === 'COMPLETE') pending.delete(id);
      else if (state === 'FAILED') throw new CliError(`screenshot ${id} failed processing in App Store Connect`, { exit: EXIT.UPLOAD, fix: 'check the PNG with `storeshots check`, then rerun' });
    }
    if (pending.size) await sleep(4000);
  }
  if (pending.size) log(`  ! ${pending.size} screenshot(s) still processing after 10 min; check App Store Connect`);
}

const md5 = file => createHash('md5').update(readFileSync(file)).digest('hex');

/**
 * Plans (and with `confirm` applies) the replacement of every locale × display-type set.
 * Returns { app, version, state, sets: [{ locale, displayType, action, existing, files }] }.
 * A set whose remote checksums already equal the local files, in order, is left alone.
 */
export async function upload(store, { devices, locales, version, confirm = false, log = console.error }) {
  const appId = store.app.ascAppId;
  if (!appId) throw new CliError('screenshots.json: app.ascAppId is missing', { fix: 'add "app": {"ascAppId": "<numeric Apple ID of the app>"}' });

  const versions = (await api('GET', `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=20&fields[appStoreVersions]=versionString,appStoreState`)).data;
  const have = versions.map(v => `${v.attributes.versionString} ${v.attributes.appStoreState}`).join(', ');
  const candidates = versions.filter(v => version ? v.attributes.versionString === version : EDITABLE.includes(v.attributes.appStoreState));
  if (!candidates.length) {
    throw new CliError(`no editable App Store version${version ? ` ${version}` : ''}`, {
      exit: EXIT.UPLOAD, detail: `have: ${have}`,
      fix: 'screenshots can only change in an editable version: create the next version in App Store Connect (or wait for review to end), then rerun',
    });
  }
  if (candidates.length > 1) throw new CliError('several editable versions', { fix: `pass --version (${candidates.map(v => v.attributes.versionString).join(', ')})` });
  const target = candidates[0];
  if (!EDITABLE.includes(target.attributes.appStoreState)) {
    throw new CliError(`version ${target.attributes.versionString} is ${target.attributes.appStoreState}; its screenshots are locked`, { exit: EXIT.UPLOAD, fix: 'upload to the next editable version' });
  }
  const result = { app: store.app.name, version: target.attributes.versionString, state: target.attributes.appStoreState, applied: confirm, sets: [] };
  log(`${store.app.name}: version ${result.version} (${result.state})${confirm ? '' : ' — plan only, add --confirm to upload'}`);

  const localizations = (await api('GET', `/v1/appStoreVersions/${target.id}/appStoreVersionLocalizations?limit=50`)).data;
  for (const locale of locales) {
    const ascLocale = store.config.ascLocales?.[locale] ?? ASC_LOCALES[locale] ?? locale;
    const localization = localizations.find(l => l.attributes.locale === ascLocale);
    if (!localization) {
      result.sets.push({ locale: ascLocale, action: 'skip', reason: `no ${ascLocale} localization in ${result.version}` });
      continue;
    }
    for (const deviceId of devices) {
      const device = store.device(deviceId);
      const dir = join(store.paths.final, deviceId, locale);
      const files = existsSync(dir) ? readdirSync(dir).filter(f => /^\d+-.+\.png$/.test(f)).sort().map(f => join(dir, f)) : [];
      const entry = { locale: ascLocale, device: deviceId, displayType: device.asc, files: files.map(f => f.split('/').pop()) };
      if (!files.length) { result.sets.push({ ...entry, action: 'skip', reason: 'nothing rendered' }); continue; }

      const sets = (await api('GET', `/v1/appStoreVersionLocalizations/${localization.id}/appScreenshotSets?filter[screenshotDisplayType]=${device.asc}`)).data;
      let set = sets[0];
      const existing = set ? (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data : [];
      const remoteSums = existing.map(e => e.attributes?.sourceFileChecksum);
      const localSums = files.map(md5);
      const unchanged = remoteSums.length === localSums.length && remoteSums.every((sum, i) => sum === localSums[i]);
      Object.assign(entry, { existing: existing.length, action: unchanged ? 'unchanged' : 'replace' });
      result.sets.push(entry);
      log(`  ${ascLocale} ${device.asc}: ${unchanged ? 'already up to date' : `replace ${existing.length} with ${files.length}`}`);
      if (!confirm || unchanged) continue;

      if (!set) {
        set = (await api('POST', '/v1/appScreenshotSets', {
          data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: device.asc },
            relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: localization.id } } } },
        })).data;
      }
      for (const shot of existing) await api('DELETE', `/v1/appScreenshots/${shot.id}`);
      const ids = [];
      for (const file of files) {
        ids.push(await uploadFile(set.id, file));
        log(`    uploaded ${file.split('/').pop()}`);
      }
      await waitProcessed(ids, log);
      await api('PATCH', `/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`, { data: ids.map(id => ({ type: 'appScreenshots', id })) });
      entry.uploaded = ids.length;
      log(`    done: ${ids.length} screenshots in order`);
    }
  }
  return result;
}
