// The App Store Connect API client shared by `upload`, `creative` and `event`.
// Credentials, the same variables as the `asc` CLI:
//   ASC_KEY_ID, ASC_ISSUER_ID, and ASC_PRIVATE_KEY_PATH (or the PEM in ASC_PRIVATE_KEY)
// or ASC_CONFIG=<json file with key_id, issuer_id, key_path>.
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { CliError, envError, EXIT } from './errors.mjs';

const API = 'https://api.appstoreconnect.apple.com';
/** Version states whose screenshots, previews and placements can still change. */
export const EDITABLE = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'];
const ASC_LOCALES = { en: 'en-US', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', nl: 'nl-NL', pt: 'pt-PT' };
const home = p => p.replace(/^~/, homedir());

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const md5 = bytes => createHash('md5').update(bytes).digest('hex');

/** A project locale ("en", "pl") → the App Store Connect locale ("en-US", "pl"); screenshots.json `ascLocales` wins. */
export const ascLocale = (store, locale) => store.config.ascLocales?.[locale] ?? ASC_LOCALES[locale] ?? locale;

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

/** The error codes App Store Connect returned ("STATE_ERROR.ENTITY_STATE_INVALID", …), from a CliError's detail. */
export const ascCodes = error => [...String(error?.detail ?? '').matchAll(/"code"\s*:\s*"([A-Z_.]+)"/g)].map(m => m[1]);

export async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new CliError(`${method} ${path} → ${res.status}`, {
      exit: res.status === 401 || res.status === 403 ? EXIT.ENV : EXIT.UPLOAD,
      detail: text.slice(0, 1200),
      fix: res.status === 401 ? 'check ASC_KEY_ID / ASC_ISSUER_ID and that the key is active' : undefined,
    });
  }
  return text ? JSON.parse(text) : {};
}

/** Every page of a GET list (follows links.next). */
export async function all(path) {
  const out = [];
  let next = path;
  while (next) {
    const page = await api('GET', next);
    out.push(...(page.data ?? []));
    next = page.links?.next ? page.links.next.replace(API, '') : null;
  }
  return out;
}

/** Sends a reserved file's bytes to the upload operations App Store Connect handed back. */
export async function sendParts(reserved, bytes, fileName) {
  for (const op of reserved.attributes.uploadOperations ?? []) {
    const headers = Object.fromEntries((op.requestHeaders ?? []).map(h => [h.name, h.value]));
    const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
    if (!res.ok) throw new CliError(`upload part of ${fileName} → ${res.status}`, { exit: EXIT.UPLOAD, detail: (await res.text()).slice(0, 300), fix: 'rerun; finished uploads are skipped' });
  }
}

/**
 * The App Store version to write to: `version` by its string, else the one editable version.
 * `live: true` also accepts a version on sale (creative assets may be placed there once approved).
 */
export async function targetVersion(appId, { version, live = false } = {}) {
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
  const target = candidates[0], state = target.attributes.appStoreState;
  if (!EDITABLE.includes(state) && !(live && state === 'READY_FOR_SALE')) {
    throw new CliError(`version ${target.attributes.versionString} is ${state}; it is locked`, { exit: EXIT.UPLOAD, fix: 'use the next editable version' });
  }
  return target;
}

/** The app's id from screenshots.json, or a usage error. */
export function appIdOf(store) {
  const appId = store.app.ascAppId;
  if (!appId) throw new CliError('screenshots.json: app.ascAppId is missing', { fix: 'add "app": {"ascAppId": "<numeric Apple ID of the app>"}' });
  return appId;
}
