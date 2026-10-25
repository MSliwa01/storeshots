// `storeshots creative`: the product page header and the search results asset (App Store
// "creative assets", iOS 27 and later). Each canvas (`header`, `search`) takes one image or
// video per localization: output/video/<canvas>/<locale>/01-*.mp4 if rendered, else
// output/final/<canvas>/<locale>/01-*.png. Localizations of the version without their own
// render get the first locale's (unless --own-only), so one asset can serve every language.
//
// Files go into the app's Asset Library once (the name carries the file's hash, so a rerun
// reuses them) and are placed on each localization of the version:
//   an editable version   placed now; App Review checks them with the version
//   the version on sale   (--version x.y) placed only once approved: --submit sends the
//                         assets to App Review on their own, a later run places them
// Without `confirm` it only returns the plan.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { all, api, appIdOf, ascCodes, ascLocale, EDITABLE, sendParts, sleep, targetVersion } from './asc.mjs';
import { CliError, EXIT, usage } from './errors.mjs';
import { hashedName, isVideo, mediaProblems, submitForReview } from './media.mjs';
import { videoFiles } from './video.mjs';

const GONE = ['FAILED', 'ARCHIVED', 'REJECTED'];
const PROCESSING = ['AWAITING_UPLOAD', 'UPLOAD_COMPLETE'];

/** The file a canvas shows in one locale: its rendered video, else its rendered image. */
export function creativeSource(store, deviceId, locale) {
  const video = videoFiles(store, deviceId, locale)[0];
  if (video) return video;
  const dir = join(store.paths.final, deviceId, locale);
  return existsSync(dir) ? readdirSync(dir).filter(f => /^\d+-.+\.(png|jpe?g)$/i.test(f)).sort().map(f => join(dir, f))[0] ?? null : null;
}

/** Uploads one file into the Asset Library and waits until App Store Connect has it. */
async function uploadAsset(appId, file, name, log) {
  const video = isVideo(file), type = video ? 'appAssetLibraryVideos' : 'appAssetLibraryImages', bytes = readFileSync(file);
  const reserved = (await api('POST', `/v1/${type}`, {
    data: { type, attributes: { category: 'CREATIVE_ASSETS', fileName: name, fileSize: bytes.length },
      relationships: { assetLibrary: { data: { type: 'appAssetLibraries', id: appId } } } },
  })).data;
  await sendParts(reserved, bytes, name);
  await api('PATCH', `/v1/${type}/${reserved.id}`, { data: { type, id: reserved.id, attributes: { uploaded: true } } });
  const deadline = Date.now() + 15 * 60_000;
  for (;;) {
    const a = (await api('GET', `/v1/${type}/${reserved.id}`)).data.attributes;
    if (a.state === 'FAILED') throw new CliError(`${name} failed processing in App Store Connect`, { exit: EXIT.UPLOAD, detail: JSON.stringify(a.stateDetails ?? []).slice(0, 600), fix: 'check the file with `storeshots check`, then rerun' });
    if (!PROCESSING.includes(a.state)) { log(`    uploaded ${name} (${a.state})`); return { id: reserved.id, type, state: a.state }; }
    if (Date.now() > deadline) throw new CliError(`${name} is still processing after 15 min`, { exit: EXIT.UPLOAD, fix: 'rerun later; the upload is reused' });
    await sleep(video ? 8000 : 3000);
  }
}

export async function creative(store, { devices, locales, version, confirm = false, submit = false, ownOnly = false, log = console.error }) {
  const appId = appIdOf(store);
  const canvases = devices.map(id => store.device(id)).filter(d => d.kind === 'creative');
  if (!canvases.length) {
    throw usage('no creative canvases in this run', {
      fix: 'add "header": {} and/or "search": {} to devices in screenshots.json, render them (storeshots render or storeshots video), then rerun',
      next: 'storeshots render --devices header,search',
    });
  }

  // Sources per canvas and locale, checked against the spec before any request.
  const sources = new Map();
  for (const canvas of canvases) {
    const byLocale = new Map();
    for (const locale of locales) {
      const file = creativeSource(store, canvas.id, locale);
      if (!file) continue;
      const problems = mediaProblems(canvas, file);
      if (problems.length) throw usage(`${file}: ${problems.join('; ')}`, { fix: 'rerender (storeshots render / storeshots video), or fix the file' });
      byLocale.set(ascLocale(store, locale), { file, locale, ...hashedName(file, canvas.id) });
    }
    if (!byLocale.size) throw usage(`nothing rendered for ${canvas.id}`, { fix: `render it first: storeshots ${canvas.video ? 'video or storeshots render' : 'render'} --devices ${canvas.id}` });
    sources.set(canvas.id, byLocale);
  }
  const fallbackLocale = ascLocale(store, store.config.creative?.fallback ?? locales[0]);

  const target = await targetVersion(appId, { version, live: true });
  const state = target.attributes.appStoreState, editable = EDITABLE.includes(state);
  const result = { app: store.app.name, version: target.attributes.versionString, state, applied: confirm, assets: [], placements: [] };
  log(`${store.app.name}: version ${result.version} (${state})${confirm ? '' : ' — plan only, add --confirm to apply'}`);
  if (!editable) log('  the version is on sale: assets are placed only after App Review approves them (--submit sends them)');

  // What the Asset Library already holds: by file name (storeshots puts the hash in it), else,
  // for files uploaded some other way, a creative asset of the same kind and exact byte size.
  const library = [];
  for (const type of ['images', 'videos']) {
    for (const a of await all(`/v1/appAssetLibraries/${appId}/${type}?limit=200`)) {
      if (!GONE.includes(a.attributes.state) && a.attributes.category !== 'APP_SCREENSHOTS_AND_PREVIEWS') {
        library.push({ id: a.id, type: `appAssetLibrary${type === 'images' ? 'Images' : 'Videos'}`, state: a.attributes.state, fileName: a.attributes.fileName, fileSize: a.attributes.fileSize });
      }
    }
  }
  const assets = new Map();
  for (const byLocale of sources.values()) {
    for (const s of byLocale.values()) {
      if (assets.has(s.name)) continue;
      const type = isVideo(s.file) ? 'appAssetLibraryVideos' : 'appAssetLibraryImages', size = statSync(s.file).size;
      const byName = library.find(a => a.fileName === s.name);
      const bySize = !byName && library.find(a => a.type === type && a.fileSize === size && !/-[0-9a-f]{10}\.\w+$/.test(a.fileName ?? ''));
      const have = byName || bySize;
      assets.set(s.name, { name: s.name, file: s.file, ...(have ? { id: have.id, type: have.type, state: have.state } : {}),
        action: byName ? 'reuse' : bySize ? `reuse ${bySize.fileName} (same size)` : 'upload' });
    }
  }
  result.assets = [...assets.values()].map(({ name, file, id, state: st, action }) => ({ name, file, id, state: st, action }));
  for (const a of result.assets) log(`  asset ${a.name}: ${a.action}${a.state ? ` (${a.state})` : ''}`);

  // Each localization × canvas: its own render, else the fallback locale's.
  const localizations = (await api('GET', `/v1/appStoreVersions/${target.id}/appStoreVersionLocalizations?limit=50`)).data;
  const plan = [];
  for (const loc of localizations) {
    const code = loc.attributes.locale;
    const placed = (await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/placements?include=image,video&limit=50`)).data;
    for (const canvas of canvases) {
      const byLocale = sources.get(canvas.id);
      const src = byLocale.get(code) ?? (ownOnly ? null : byLocale.get(fallbackLocale) ?? [...byLocale.values()][0]);
      if (!src) { result.placements.push({ locale: code, placement: canvas.placement, action: 'skip', reason: 'no render for this locale (--own-only)' }); continue; }
      const current = placed.find(p => p.attributes.placementType === canvas.placement);
      const currentAsset = current && (current.relationships?.image?.data?.id ?? current.relationships?.video?.data?.id);
      const asset = assets.get(src.name);
      const entry = { locale: code, placement: canvas.placement, source: ascLocale(store, src.locale) === code ? 'own' : `fallback ${src.locale}`, asset: src.name };
      if (current && asset.id && currentAsset === asset.id) entry.action = 'unchanged';
      else if (!editable && asset.state !== 'APPROVED') entry.action = 'waiting for approval';
      else entry.action = current ? 'replace' : 'place';
      result.placements.push(entry);
      plan.push({ entry, loc, canvas, current, asset });
    }
  }
  const counts = result.placements.reduce((m, p) => ({ ...m, [p.action]: (m[p.action] ?? 0) + 1 }), {});
  log(`  placements: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  if (!confirm) {
    result.next = editable ? 'storeshots creative --confirm' : 'storeshots creative --confirm --submit (sends the assets for review; rerun after approval to place them)';
    return result;
  }

  for (const asset of assets.values()) {
    if (asset.action !== 'upload') continue;  // reused ones already have an id
    Object.assign(asset, await uploadAsset(appId, asset.file, asset.name, log));
  }
  for (const { entry, loc, canvas, current, asset } of plan) {
    if (!['place', 'replace'].includes(entry.action)) continue;
    if (current) await api('DELETE', `/v1/appAssetLibraryPlacements/${current.id}`);
    const relation = asset.type === 'appAssetLibraryVideos' ? 'video' : 'image';
    try {
      await api('POST', '/v1/appAssetLibraryPlacements', {
        data: { type: 'appAssetLibraryPlacements', attributes: { placementType: canvas.placement, placementGroup: 'DEFAULT_PROFILE' },
          relationships: { [relation]: { data: { type: asset.type, id: asset.id } }, appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } },
      });
    } catch (e) {
      const codes = ascCodes(e);
      if (codes.some(c => /APPROVED|STATE/.test(c))) throw new CliError(`placing ${asset.name} on ${entry.locale} was refused`, { exit: EXIT.UPLOAD, detail: e.detail, fix: 'on a version that is on sale the asset must be approved first (--submit); a running product page optimization test also blocks placements' });
      throw e;
    }
    entry.done = true;
    log(`    ${entry.locale} ${canvas.placement}: placed ${asset.name}`);
  }
  if (submit) {
    const items = [...assets.values()].filter(a => a.id && !['APPROVED', 'WAITING_FOR_REVIEW', 'IN_REVIEW', 'ACCEPTED'].includes(a.state))
      .map(a => ({ relationship: a.type === 'appAssetLibraryVideos' ? 'appAssetLibraryVideo' : 'appAssetLibraryImage', type: a.type, id: a.id }));
    if (editable) log('  --submit skipped: placed on an editable version, the assets are reviewed with it');
    else if (items.length) result.submission = await submitForReview(appId, items, log);
  }

  // Read back what App Store Connect now holds.
  result.verified = [];
  for (const loc of localizations) {
    const placed = (await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/placements?limit=50`)).data;
    for (const canvas of canvases) {
      const p = placed.find(x => x.attributes.placementType === canvas.placement);
      result.verified.push({ locale: loc.attributes.locale, placement: canvas.placement, state: p?.attributes.state ?? null });
    }
  }
  const missing = result.verified.filter(v => !v.state);
  log(`  verified: ${result.verified.length - missing.length}/${result.verified.length} placements present`);
  return result;
}
