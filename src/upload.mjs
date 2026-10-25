// Uploads output/final/<device>/<locale>/NN-*.png into the editable App Store version:
// replaces the screenshot set of each locale × display type and keeps the file order.
// Canvases that share a display type (the iPhone Duo's outer and inner displays) fill one
// set together, in the order of screenshots.json. App preview canvases upload
// output/video/<device>/<locale>/NN-*.mp4 into the app preview set the same way.
// Without `confirm` it only returns the plan (dry run). Headers, search results assets and
// In-App Events have their own commands (`creative`, `event`).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { api, appIdOf, ascLocale, md5, sendParts, sleep, targetVersion } from './asc.mjs';
import { videoProblems } from './devices.mjs';
import { CliError, EXIT, usage } from './errors.mjs';
import { probe, videoFiles } from './video.mjs';

export { ascCredentials } from './asc.mjs';

const MIME = { '.mp4': 'video/mp4', '.m4v': 'video/x-m4v', '.mov': 'video/quicktime' };

/** Polls uploaded media until App Store Connect has processed it (or 10 minutes pass). */
async function waitProcessed(path, ids, log) {
  const deadline = Date.now() + 10 * 60_000;
  const pending = new Set(ids);
  while (pending.size && Date.now() < deadline) {
    for (const id of [...pending]) {
      const state = (await api('GET', `${path}/${id}`)).data.attributes.assetDeliveryState?.state;
      if (state === 'COMPLETE') pending.delete(id);
      else if (state === 'FAILED') throw new CliError(`${path.split('/').pop()} ${id} failed processing in App Store Connect`, { exit: EXIT.UPLOAD, fix: 'check the file with `storeshots check`, then rerun' });
    }
    if (pending.size) await sleep(4000);
  }
  if (pending.size) log(`  ! ${pending.size} file(s) still processing after 10 min; check App Store Connect`);
}

/** Reserves, sends and commits one screenshot or preview; returns its id. */
async function uploadMedia(type, relationship, setId, file, extra = {}) {
  const bytes = readFileSync(file), fileName = file.split('/').pop();
  const reserved = (await api('POST', `/v1/${type}`, {
    data: { type, attributes: { fileName, fileSize: bytes.length, ...extra },
      relationships: { [relationship]: { data: { type: `${relationship}s`, id: setId } } } },
  })).data;
  await sendParts(reserved, bytes, fileName);
  await api('PATCH', `/v1/${type}/${reserved.id}`, { data: { type, id: reserved.id, attributes: { uploaded: true, sourceFileChecksum: md5(bytes) } } });
  return reserved.id;
}

const pngFiles = (store, deviceId, locale) => {
  const dir = join(store.paths.final, deviceId, locale);
  return existsSync(dir) ? readdirSync(dir).filter(f => /^\d+-.+\.png$/.test(f)).sort().map(f => join(dir, f)) : [];
};

/**
 * The upload plan's units: screenshot canvases grouped by display type (in screenshots.json
 * order), and app preview canvases one by one. Creative and event canvases are left out.
 */
function units(store, devices) {
  const groups = new Map(), previews = [], skipped = [];
  for (const id of devices) {
    const spec = store.device(id);
    if (spec.kind === 'preview') { previews.push(spec); continue; }
    if (spec.kind !== 'screenshot') { skipped.push({ device: id, reason: `${spec.label} goes up with \`storeshots ${spec.kind === 'event' ? 'event' : 'creative'}\`` }); continue; }
    if (!spec.asc) throw new CliError(`no verified App Store Connect API slot for ${spec.label}`, { exit: EXIT.UPLOAD, fix: 'upload these rendered files manually in App Store Connect; automatic upload needs a verified display type' });
    if (!groups.has(spec.asc)) groups.set(spec.asc, []);
    groups.get(spec.asc).push(spec);
  }
  const order = Object.keys(store.config.devices ?? {});
  for (const list of groups.values()) list.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return { groups: [...groups.entries()], previews, skipped };
}

/**
 * Plans (and with `confirm` applies) the replacement of every locale × display-type set.
 * Returns { app, version, state, sets: [{ locale, displayType, action, existing, files }] }.
 * A set whose remote checksums already equal the local files, in order, is left alone.
 */
export async function upload(store, { devices, locales, version, confirm = false, log = console.error }) {
  const appId = appIdOf(store);
  const { groups, previews, skipped } = units(store, devices);
  for (const s of skipped) log(`  skip ${s.device}: ${s.reason}`);

  // Everything that can be refused offline is refused before the first request.
  for (const locale of locales) {
    for (const [asc, list] of groups) {
      const count = list.reduce((n, d) => n + pngFiles(store, d.id, locale).length, 0);
      if (count > 10) throw usage(`${locale} ${asc}: ${count} screenshots across ${list.map(d => d.id).join(' + ')}, App Store Connect takes at most 10 per set`, { fix: 'render fewer slides for one of these displays (--slides), or drop one display from screenshots.json' });
    }
    for (const d of previews) {
      const files = videoFiles(store, d.id, locale);
      if (files.length > d.max) throw usage(`${d.id}/${locale}: ${files.length} app previews, at most ${d.max}`);
      for (const file of files) {
        const problems = videoProblems(d, probe(file));
        if (problems.length) throw usage(`${file}: ${problems.join('; ')}`, { fix: 'rerender with `storeshots video` (it meets the spec), or fix the file' });
      }
    }
  }

  const target = await targetVersion(appId, { version });
  const result = { app: store.app.name, version: target.attributes.versionString, state: target.attributes.appStoreState, applied: confirm, sets: [], skipped };
  log(`${store.app.name}: version ${result.version} (${result.state})${confirm ? '' : ' — plan only, add --confirm to upload'}`);

  const localizations = (await api('GET', `/v1/appStoreVersions/${target.id}/appStoreVersionLocalizations?limit=50`)).data;
  for (const locale of locales) {
    const code = ascLocale(store, locale);
    const localization = localizations.find(l => l.attributes.locale === code);
    if (!localization) {
      result.sets.push({ locale: code, action: 'skip', reason: `no ${code} localization in ${result.version}` });
      continue;
    }
    for (const [asc, list] of groups) {
      const files = list.flatMap(d => pngFiles(store, d.id, locale));
      const entry = { locale: code, device: list.map(d => d.id).join('+'), displayType: asc, files: files.map(f => f.split('/').pop()) };
      if (!files.length) { result.sets.push({ ...entry, action: 'skip', reason: 'nothing rendered' }); continue; }

      const sets = (await api('GET', `/v1/appStoreVersionLocalizations/${localization.id}/appScreenshotSets?filter[screenshotDisplayType]=${asc}`)).data;
      let set = sets[0];
      const existing = set ? (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data : [];
      const unchanged = sameFiles(existing, files);
      Object.assign(entry, { existing: existing.length, action: unchanged ? 'unchanged' : 'replace' });
      result.sets.push(entry);
      log(`  ${code} ${asc}: ${unchanged ? 'already up to date' : `replace ${existing.length} with ${files.length}`}`);
      if (!confirm || unchanged) continue;

      if (!set) {
        set = (await api('POST', '/v1/appScreenshotSets', {
          data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: asc },
            relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: localization.id } } } },
        })).data;
      }
      for (const shot of existing) await api('DELETE', `/v1/appScreenshots/${shot.id}`);
      const ids = [];
      for (const file of files) {
        ids.push(await uploadMedia('appScreenshots', 'appScreenshotSet', set.id, file));
        log(`    uploaded ${file.split('/').pop()}`);
      }
      await waitProcessed('/v1/appScreenshots', ids, log);
      await api('PATCH', `/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`, { data: ids.map(id => ({ type: 'appScreenshots', id })) });
      entry.uploaded = ids.length;
      log(`    done: ${ids.length} screenshots in order`);
    }

    for (const d of previews) {
      const files = videoFiles(store, d.id, locale);
      const entry = { locale: code, device: d.id, previewType: d.previewType, files: files.map(f => f.split('/').pop()) };
      if (!files.length) { result.sets.push({ ...entry, action: 'skip', reason: 'no video rendered (storeshots video)' }); continue; }
      const sets = (await api('GET', `/v1/appStoreVersionLocalizations/${localization.id}/appPreviewSets?filter[previewType]=${d.previewType}`)).data;
      let set = sets[0];
      const existing = set ? (await api('GET', `/v1/appPreviewSets/${set.id}/appPreviews?limit=10`)).data : [];
      const unchanged = sameFiles(existing, files);
      Object.assign(entry, { existing: existing.length, action: unchanged ? 'unchanged' : 'replace' });
      result.sets.push(entry);
      log(`  ${code} ${d.previewType} previews: ${unchanged ? 'already up to date' : `replace ${existing.length} with ${files.length}`}`);
      if (!confirm || unchanged) continue;

      if (!set) {
        set = (await api('POST', '/v1/appPreviewSets', {
          data: { type: 'appPreviewSets', attributes: { previewType: d.previewType },
            relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: localization.id } } } },
        })).data;
      }
      for (const preview of existing) await api('DELETE', `/v1/appPreviews/${preview.id}`);
      const ids = [], poster = store.config.devices?.[d.id]?.video?.poster ?? store.config.video?.poster;
      for (const file of files) {
        ids.push(await uploadMedia('appPreviews', 'appPreviewSet', set.id, file, { mimeType: MIME[extname(file).toLowerCase()], ...(poster ? { previewFrameTimeCode: poster } : {}) }));
        log(`    uploaded ${file.split('/').pop()}`);
      }
      await waitProcessed('/v1/appPreviews', ids, log);
      await api('PATCH', `/v1/appPreviewSets/${set.id}/relationships/appPreviews`, { data: ids.map(id => ({ type: 'appPreviews', id })) });
      entry.uploaded = ids.length;
      log(`    done: ${ids.length} previews in order`);
    }
  }
  return result;
}

/** The remote set holds exactly these files, in this order (by MD5). */
function sameFiles(existing, files) {
  const remote = existing.map(e => e.attributes?.sourceFileChecksum);
  return remote.length === files.length && files.every((f, i) => remote[i] === md5(readFileSync(f)));
}
