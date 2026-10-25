import { usage } from './errors.mjs';

// Store canvases. Raw captures and final slides share one canvas. `kind` says where a
// canvas goes in App Store Connect:
//   screenshot  a screenshot set (`asc`: its display type; canvases sharing one type share one set)
//   preview     an app preview set (`previewType`), video only
//   creative    a product page header or search results asset (`placement`), image or video
//   event       an In-App Event card or details page (`assetType`), image or video
// Canvases other than screenshots show another device's captures (`shotsFrom`; by default
// the first screenshot device in screenshots.json).
// Sizes, frame rates and lengths come from App Store Connect's /v1/appAssetLibraryRefData,
// checked 2026-10-25. Where its spec name is stricter than its numbers (header "t10~30",
// search "t15~30"), the stricter one is used.
export const DEVICES = {
  'iphone-6.9': {
    label: 'iPhone 6.9"',
    width: 1320, height: 2868,
    asc: 'APP_IPHONE_67', // App Store Connect calls the 6.9" slot APP_IPHONE_67
    simulator: { name: 'iPhone 18 Pro Max Shots', type: 'com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro-Max' },
    frame: 'iphone-18-pro-max/black',
  },
  'ipad-13': {
    label: 'iPad 13"',
    width: 2064, height: 2752,
    asc: 'APP_IPAD_PRO_3GEN_129',
    simulator: { name: 'iPad Pro 13 Shots', type: 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB' },
    frame: 'ipad-pro-13-m5/space-black',
  },
  // Both Duo displays go into one APP_IPHONE_DUO set (10 at most between them), outer first.
  // Duo pose control in the Simulator is not automated: capture by hand, then `import`.
  'iphone-duo-outer': {
    label: 'iPhone Duo outer display (portrait)',
    width: 1398, height: 2034,
    asc: 'APP_IPHONE_DUO',
    frame: 'generic/black',
  },
  'iphone-duo-inner': {
    label: 'iPhone Duo inner display (landscape)',
    width: 2853, height: 2007,
    asc: 'APP_IPHONE_DUO',
    frame: 'generic/black',
  },
  'preview-iphone-6.9': {
    label: 'App preview, iPhone 6.9"',
    kind: 'preview', previewType: 'IPHONE_67', shotsFrom: 'iphone-6.9',
    width: 886, height: 1920,
    video: { fps: [23, 30], min: 15, max: 30, audio: true },
    max: 3,
  },
  'preview-ipad-13': {
    label: 'App preview, iPad 13"',
    kind: 'preview', previewType: 'IPAD_PRO_3GEN_129', shotsFrom: 'ipad-13',
    width: 1200, height: 1600,
    video: { fps: [23, 30], min: 15, max: 30, audio: true },
    max: 3,
  },
  header: {
    label: 'Product page header (21:9)',
    kind: 'creative', placement: 'PRODUCT_PAGE_HEADER_ASSET',
    width: 3840, height: 1646,
    image: { ext: ['.png'] },
    video: { fps: [30, 30, 60, 60], min: 10, max: 30 },
    max: 1,
  },
  search: {
    label: 'Search results asset (3:2)',
    kind: 'creative', placement: 'APP_STORE_SEARCH_RESULTS_ASSET',
    width: 2880, height: 1920,
    range: { ratio: 3 / 2, minWidth: 1920, maxWidth: 3840 },
    image: { ext: ['.png', '.jpg', '.jpeg'] },
    video: { fps: [30, 30, 60, 60], min: 15, max: 30 },
    max: 1,
  },
  'event-card': {
    label: 'In-App Event card (16:9)',
    kind: 'event', assetType: 'EVENT_CARD',
    width: 1920, height: 1080,
    range: { ratio: 16 / 9, minWidth: 1920, maxWidth: 3840 },
    image: { ext: ['.png', '.jpg', '.jpeg'] },
    video: { fps: [30, 30, 60, 60], min: 15, max: 30 },
    max: 1,
  },
  'event-details': {
    label: 'In-App Event details page (9:16)',
    kind: 'event', assetType: 'EVENT_DETAILS_PAGE',
    width: 1080, height: 1920,
    range: { ratio: 9 / 16, minWidth: 1080, maxWidth: 2160 },
    image: { ext: ['.png', '.jpg', '.jpeg'] },
    video: { fps: [30, 30, 60, 60], min: 15, max: 30 },
    max: 1,
  },
};

/** Largest file App Store Connect takes for any of these (500 MB). */
export const MAX_FILE = 524288000;

export function device(id) {
  const spec = DEVICES[id];
  if (!spec) throw usage(`unknown device "${id}"`, { fix: `known devices: ${Object.keys(DEVICES).join(', ')}` });
  return { id, kind: 'screenshot', max: 10, ...spec };
}

/** Whether a width × height fits the canvas: its exact size, or (for ranged specs) the ratio within the widths. */
export function sizeFits(spec, width, height) {
  if (width === spec.width && height === spec.height) return true;
  const r = spec.range;
  return !!r && width >= r.minWidth && width <= r.maxWidth && Math.abs(width / height - r.ratio) < 0.005;
}

/** Problems of a probed video against a canvas's video spec ([] when it fits). */
export function videoProblems(spec, { width, height, fps, duration, audio, bytes, ext }) {
  const v = spec.video, out = [];
  if (!v) return [`${spec.label ?? spec.id} takes no video`];
  if (!sizeFits(spec, width, height)) out.push(`${width}×${height}, needs ${spec.width}×${spec.height}${spec.range ? ` (or ${spec.range.minWidth}–${spec.range.maxWidth} px wide at the same ratio)` : ''}`);
  const pairs = [];
  for (let i = 0; i < v.fps.length; i += 2) pairs.push([v.fps[i], v.fps[i + 1]]);
  if (!pairs.some(([lo, hi]) => fps >= lo - 0.01 && fps <= hi + 0.01)) out.push(`${Math.round(fps * 100) / 100} fps, needs ${pairs.map(([lo, hi]) => (lo === hi ? lo : `${lo}–${hi}`)).join(' or ')}`);
  if (duration < v.min - 0.05 || duration > v.max + 0.05) out.push(`${duration.toFixed(2)} s long, needs ${v.min}–${v.max} s`);
  if (v.audio && !audio) out.push('has no audio track; app previews need one (a silent track is fine)');
  if (bytes > MAX_FILE) out.push(`${Math.round(bytes / 1e6)} MB, the limit is 500 MB`);
  if (ext && !['.mp4', '.mov', '.m4v'].includes(ext)) out.push(`${ext} file; use .mp4, .mov or .m4v`);
  return out;
}
