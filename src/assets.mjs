// The app's own graphics, for compositions: mascots, illustrations, badges, backgrounds,
// plus its fonts and colours. `scanAssets` walks the app repo and lists what is there with
// sizes; `assets` also draws numbered contact sheets so an agent can see what each one is
// and write store/assets.json (id, file, role, what it suits). Rive files are rendered in
// Chrome (a pose = artboard + animation or state machine + time), so a mascot needs no
// image generation.
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { detectBrand } from './brand.mjs';
import { launchBrowser } from './browser.mjs';
import { decodePng, encodePng } from './png.mjs';
import { ROOT } from './paths.mjs';
import { usage } from './errors.mjs';

const SKIP = new Set(['node_modules', '.git', 'build', 'Pods', 'DerivedData', '.build', 'dist', '.expo', 'output', 'store', 'android', 'worktrees', 'xcuserdata', 'coverage', '__snapshots__', 'Carthage', '.dart_tool', 'ephemeral']);
const RASTER = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MIN_SIDE = 128; // smaller rasters are UI glyphs, not art
const GROUP_AT = 12; // a folder with more art than this is shown as one group (an emoji set, game icons)
const PER_SHEET = 48;
const BUDGET = 4 * PER_SHEET; // entries on the overview sheets; the rest is folded into folders
const SYSTEM_FONTS = /^(courier|menlo|monospace|system|helvetica|arial|georgia|times|sf ?pro|sf-pro|\.sf|avenir|verdana|inherit)/i;
const SOURCE = /\.(swift|m|tsx?|jsx?|mjs|dart|kt|json|ya?ml|plist|xml|html|css)$/;

function walk(dir, depth = 0, out = []) {
  if (depth > 9) return out;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, depth + 1, out);
    else out.push(p);
  }
  return out;
}

function head(file, bytes = 256 * 1024) {
  const fd = openSync(file, 'r');
  try { const buf = Buffer.alloc(bytes); const n = readSync(fd, buf, 0, bytes, 0); return buf.subarray(0, n); } finally { closeSync(fd); }
}

/** Pixel size of a PNG, JPEG or WebP from its header; SVG from its viewBox or width/height. */
export function imageSize(file) {
  const ext = extname(file).toLowerCase();
  try {
    if (ext === '.svg') {
      const svg = head(file, 8192).toString('utf8');
      const box = svg.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
      const w = svg.match(/<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i), h = svg.match(/<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i);
      return box ? { width: Math.round(+box[1]), height: Math.round(+box[2]), vector: true } : w && h ? { width: Math.round(+w[1]), height: Math.round(+h[1]), vector: true } : { width: 0, height: 0, vector: true };
    }
    const buf = head(file);
    if (buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), alpha: buf[25] === 4 || buf[25] === 6 || buf.includes(Buffer.from('tRNS')) };
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      for (let i = 2; i < buf.length - 9;) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5), alpha: false };
        i += 2 + len;
      }
    }
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const kind = buf.toString('ascii', 12, 16);
      if (kind === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3), alpha: !!(buf[20] & 0x10) };
      if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, alpha: !!((b >> 28) & 1) }; }
      if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, alpha: false };
    }
  } catch { /* unreadable: size 0 */ }
  return { width: 0, height: 0 };
}

const isLottie = file => {
  if (statSync(file).size > 8e6) return false;
  const text = head(file, 4096).toString('utf8');
  return /"v"\s*:\s*"\d/.test(text) && /"fr"\s*:/.test(text) && /"layers"\s*:/.test(text);
};

/** Colour set JSON → { any: '#rrggbb', dark?: '#rrggbb' }. */
function colourSet(dir) {
  try {
    const { colors = [] } = JSON.parse(readFileSync(join(dir, 'Contents.json'), 'utf8'));
    const hex = c => {
      const v = x => { const s = String(x); const n = s.startsWith('0x') ? parseInt(s, 16) : parseFloat(s); return Math.round(n <= 1 && !s.startsWith('0x') && !/^\d{2,3}$/.test(s) ? n * 255 : n); };
      const k = c?.color?.components;
      return k ? '#' + [k.red, k.green, k.blue].map(v).map(n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('') : null;
    };
    const out = {};
    for (const c of colors) {
      const dark = c.appearances?.some(a => a.value === 'dark');
      if (c.appearances?.length && !dark) continue;
      out[dark ? 'dark' : 'any'] = hex(c);
    }
    return out;
  } catch { return {}; }
}

/** Font families the code asks for (SwiftUI, React Native, Flutter, Expo Google Fonts). */
function referencedFonts(files, root) {
  const found = new Set();
  for (const f of files.filter(f => /\.(swift|tsx?|jsx?|dart)$/.test(f)).slice(0, 4000)) {
    let text;
    try { if (statSync(f).size > 1e6) continue; text = readFileSync(f, 'utf8'); } catch { continue; }
    for (const m of text.matchAll(/(?:Font\.custom|\.custom)\(\s*"([^"]+)"/g)) found.add(m[1]);
    for (const m of text.matchAll(/fontFamily\s*:\s*['"]([^'"]+)['"]/g)) found.add(m[1]);
  }
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    for (const name of Object.keys({ ...pkg.dependencies })) { const m = name.match(/^@expo-google-fonts\/(.+)$/); if (m && m[1] !== 'dev') found.add(`${m[1]} (Google Fonts)`); }
  } catch { /* not an Expo app */ }
  return [...found].sort();
}

// Folders of work files (QA captures, mockups, explorations), never shipped art.
const WORK = /(^|\/)(artifacts?|tmp|temp|docs?|screenshots?|reviews?|mockups?|qa|exploration|explorations|concepts?|revisions?|drafts?|archive|old|backup|stud(y|ies)|references?|refs|fastlane|metadata)(\/|$|[-_])/i;
// A phone-screen-shaped raster is a capture of the app, not art.
const screenShaped = a => !a.vector && a.width && a.height && a.width / a.height > 0.43 && a.width / a.height < 0.5 && a.width >= 320;

/** The app's code and config as one lowercase string, to tell shipped art from work files. */
function sourceText(files, root) {
  const parts = [];
  let total = 0;
  for (const f of files) {
    if (!SOURCE.test(f) || WORK.test(dirname(relative(root, f)))) continue;
    try { const size = statSync(f).size; if (size > 2e6 || total > 6e7) continue; total += size; parts.push(readFileSync(f, 'utf8').toLowerCase()); } catch { /* unreadable */ }
  }
  return parts.join('\n');
}

/** Referenced by the code: its name, its image set or its folder appears in the source. */
function shipped(a, code) {
  if (WORK.test(dirname(a.file)) || screenShaped(a)) return false;
  const name = a.name.toLowerCase().replace(/@[23]x$/, '');
  if (a.set || code.includes(`${name}.${a.format}`) || (name.length > 3 && new RegExp(`["'/]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(@[23]x)?(\\.|["'])`).test(code))) return true;
  const dir = dirname(a.file).toLowerCase().split('/').slice(-2).join('/');
  return dir.length > 3 && (code.includes(`${dir}/`) || code.includes(`'${dir}'`) || code.includes(`"${dir}"`));
}

/** Folds folders into groups, biggest first, until the entries fit the budget. */
function fold(art, budget, collapseAt = GROUP_AT) {
  let units = [];
  const byDir = new Map();
  for (const a of art) { const d = dirname(a.file); (byDir.get(d) ?? byDir.set(d, []).get(d)).push(a); }
  for (const [dir, list] of byDir) units.push(list.length > collapseAt ? { dir, list, group: true } : { dir, list, group: false });
  const size = u => (u.group ? 1 : u.list.length);
  // Still too many: fold whole subtrees one level up, the largest first.
  for (let level = 6; units.reduce((n, u) => n + size(u), 0) > budget && level >= 1; level--) {
    const merged = new Map();
    for (const u of units) {
      const key = u.dir.split('/').slice(0, level).join('/');
      const m = merged.get(key) ?? merged.set(key, { dir: key, list: [], group: false, parts: 0 }).get(key);
      m.list.push(...u.list); m.parts++; m.group ||= u.group;
    }
    units = [...merged.values()].map(u => ({ ...u, group: u.group || u.parts > 1 || u.list.length > collapseAt }));
  }
  return units.sort((a, b) => a.dir.localeCompare(b.dir));
}

const groupEntry = (dir, list, extra = {}) => {
  const sorted = [...list].sort((a, b) => b.width * b.height - a.width * a.height);
  return { kind: 'group', dir, count: list.length, samples: sorted.filter((_, i) => i % Math.max(1, Math.floor(sorted.length / 8)) === 0).slice(0, 8).map(a => a.file),
    largest: `${sorted[0].width}×${sorted[0].height}`, smallest: `${sorted.at(-1).width}×${sorted.at(-1).height}`, vector: list.every(a => a.vector), ...extra };
};

/**
 * Everything graphic in the app repo. Asset-catalog image sets count once (their biggest
 * file); duplicates (same bytes) count once; folders with many pieces become one group.
 */
export function scanAssets(appRoot, { dir: only } = {}) {
  const root = resolve(appRoot);
  const files = walk(only ? resolve(root, only) : root);
  const code = sourceText(only ? walk(root) : files, root);
  const seen = new Set(), items = [], fonts = [], rive = [], lottie = [], colours = {};
  const imagesets = new Map();
  for (const f of files) {
    const ext = extname(f).toLowerCase(), dir = dirname(f);
    if (dir.endsWith('.colorset')) { if (basename(f) === 'Contents.json') colours[basename(dir, '.colorset')] = colourSet(dir); continue; }
    if (/\.appiconset$/.test(dir)) continue;
    if (ext === '.ttf' || ext === '.otf') { fonts.push(relative(root, f)); continue; }
    if (ext === '.riv') { rive.push(relative(root, f)); continue; }
    if (ext === '.json' && !/package|tsconfig|app\.json|Contents\.json|eas\.json/.test(basename(f)) && isLottie(f)) { lottie.push(relative(root, f)); continue; }
    if (!RASTER.has(ext) && ext !== '.svg' && !(ext === '.pdf' && dir.endsWith('.imageset'))) continue;
    if (dir.endsWith('.imageset')) { (imagesets.get(dir) ?? imagesets.set(dir, []).get(dir)).push(f); continue; }
    items.push(f);
  }
  // An image set is one asset: its largest raster, or its vector.
  for (const [dir, list] of imagesets) {
    const vector = list.find(f => /\.(svg|pdf)$/i.test(f));
    const best = vector ?? list.sort((a, b) => statSync(b).size - statSync(a).size)[0];
    if (best) items.push(Object.assign(new String(best), { set: basename(dir, '.imageset') }));
  }
  const art = [];
  for (const entry of items) {
    const f = String(entry), ext = extname(f).toLowerCase();
    const hash = createHash('sha1').update(head(f, 65536)).update(String(statSync(f).size)).digest('hex');
    if (seen.has(hash)) continue;
    seen.add(hash);
    const size = ext === '.pdf' ? { width: 0, height: 0, vector: true } : imageSize(f);
    if (!size.vector && Math.min(size.width, size.height) < MIN_SIDE) continue;
    art.push({ file: relative(root, f), name: entry.set ?? basename(f, ext), ...(entry.set && { set: true }), ...size, format: ext.slice(1) });
  }
  // Art the code uses first, one by one (big families as groups); work files and art the code
  // never names after it, folded into folders. `--dir` shows one folder in full.
  for (const x of art) x.shipped = shipped(x, code);
  const entries = [];
  const used = art.filter(x => only || x.shipped), unused = art.filter(x => !only && !x.shipped);
  for (const u of fold(used, only ? BUDGET * 2 : BUDGET, only ? 1e9 : GROUP_AT)) entries.push(...(u.group ? [groupEntry(u.dir, u.list, { shipped: true })] : u.list.map(x => ({ kind: x.vector ? 'vector' : 'image', ...x }))));
  for (const u of fold(unused, 24, 0)) entries.push(groupEntry(u.dir, u.list, { shipped: false }));
  entries.forEach((e, i) => { e.n = i + 1; });
  const brand = detectBrand(root);
  const referenced = referencedFonts(files, root);
  const norm = x => x.toLowerCase().replace(/\(google fonts\)|[-_ ]/g, '');
  const fontNames = fonts.map(f => norm(basename(f).replace(/\.(ttf|otf)$/i, '')));
  const google = referenced.filter(r => r.includes('Google Fonts')).map(norm);
  return {
    root, icon: brand.icon, accent: brand.accent, colours,
    fonts: { files: [...new Set(fonts.map(f => basename(f)))].sort(), referenced,
      missing: referenced.filter(r => !r.includes('Google Fonts') && !SYSTEM_FONTS.test(r) && !fontNames.some(n => n.startsWith(norm(r))) && !google.some(g => norm(r).startsWith(g))) },
    rive, lottie, art: entries,
  };
}

/** The app repo a store project belongs to: app.root in screenshots.json, else the folder above store/. */
export const appRootOf = store => resolve(store.dir, store.config.app?.root ?? '..');

/**
 * An SVG a browser can show: Xcode accepts SVGs without the xmlns attribute, Chrome draws
 * them as broken images. Such files get a fixed copy in `cacheDir`; others are used as they are.
 */
export function webSafe(file, cacheDir) {
  if (!/\.svg$/i.test(file)) return file;
  const text = readFileSync(file, 'utf8');
  if (/<svg[^>]*\sxmlns\s*=/.test(text)) return file;
  const out = join(cacheDir, `${basename(file, '.svg')}-${createHash('sha1').update(text).digest('hex').slice(0, 8)}.svg`);
  if (!existsSync(out)) { mkdirSync(cacheDir, { recursive: true }); writeFileSync(out, text.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"')); }
  return out;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function sheetHTML(entries, root, riveThumbs, cacheDir = null) {
  const url = f => pathToFileURL(cacheDir ? webSafe(resolve(root, f), cacheDir) : resolve(root, f)).href;
  const cell = e => {
    if (e.kind === 'group') return `<figure class="g"><div class="pics">${e.samples.map(s => `<img src="${url(s)}">`).join('')}</div>
      <figcaption><b>${e.n}</b> ${esc(e.dir)}/ <i>×${e.count}, ${e.vector ? 'vector' : `${e.smallest}–${e.largest}`}${e.shipped ? '' : ', not in the code'}</i></figcaption></figure>`;
    const src = e.kind === 'rive' ? riveThumbs[e.file] : e.format === 'pdf' ? null : url(e.file);
    return `<figure><div class="pic">${src ? `<img src="${src}">` : '<span>PDF vector</span>'}</div>
      <figcaption><b>${e.n}</b> ${esc(e.name)} <i>${e.kind === 'rive' ? 'Rive' : e.vector ? 'vector' : `${e.width}×${e.height}`}</i></figcaption></figure>`;
  };
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 24px; width: 1680px; background: #fff; font: 500 15px system-ui, sans-serif; color: #333; }
    main { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; }
    figure { margin: 0; } figure.g { grid-column: span 2; }
    .pic, .pics { height: 230px; border-radius: 10px; background: conic-gradient(#8e8e96 25%, #a9a9b0 0 50%, #8e8e96 0 75%, #a9a9b0 0) 0 0 / 24px 24px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .pics { flex-wrap: wrap; gap: 6px; padding: 8px; box-sizing: border-box; }
    .pic img { max-width: 92%; max-height: 92%; } .pics img { max-width: 23%; max-height: 46%; }
    span { color: #888; } figcaption { margin-top: 6px; line-height: 1.25; word-break: break-all; } b { color: #000; } i { color: #888; font-style: normal; }
  </style><main>${entries.map(cell).join('\n')}</main>`;
}

/** A page that serves the Rive runtime and a .riv file from disk (wasm must be fetched over http(s)). */
async function rivePage(browser, root) {
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  const runtime = join(ROOT, 'node_modules', '@rive-app', 'canvas');
  if (!existsSync(join(runtime, 'rive.js'))) throw usage('the Rive runtime is not installed', { fix: 'run `npm install` in the storeshots folder (it adds @rive-app/canvas)' });
  await page.route('https://storeshots.local/**', route => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = path.startsWith('/rive/') ? join(runtime, path.slice(6)) : path.startsWith('/app/') ? join(root, path.slice(5)) : null;
    if (!file || !existsSync(file)) return route.fulfill({ status: 404, body: '' });
    const type = file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
    return route.fulfill({ status: 200, body: readFileSync(file), headers: { 'content-type': type, 'access-control-allow-origin': '*' } });
  });
  await page.route('https://storeshots.local/', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><body style="margin:0;background:transparent"><script src="/rive/rive.js"></script>' }));
  await page.goto('https://storeshots.local/');
  await page.evaluate(() => rive.RuntimeLoader.setWasmUrl('/rive/rive.wasm'));
  return page;
}

/** Artboards, animations and state machines of a .riv file. */
async function riveContents(page, file) {
  return page.evaluate(src => new Promise((ok, fail) => {
    const canvas = document.createElement('canvas');
    const r = new rive.Rive({ src, canvas, autoplay: false, onLoad: () => { ok(r.contents); r.cleanup(); }, onLoadError: e => fail(new Error(String(e?.data ?? e))) });
  }), `/app/${file}`);
}

/**
 * One pose of a Rive file as a trimmed, transparent PNG: artboard, an animation or a state
 * machine, played for `time` seconds. Returns the PNG buffer.
 */
async function rivePose(page, file, { artboard, animation, stateMachine, time = 0.6, size = 1600, keepBackground = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  const box = await page.evaluate(({ src, artboard, animation, stateMachine, time, size }) => new Promise((ok, fail) => {
    document.body.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    Object.assign(canvas.style, { width: `${size}px`, height: `${size}px`, display: 'block' });
    document.body.append(canvas);
    const r = new rive.Rive({ src, canvas, artboard, animations: animation, stateMachines: stateMachine, autoplay: true,
      layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center }),
      onLoad: () => setTimeout(() => { r.pause(); requestAnimationFrame(() => ok({ w: size, h: size })); }, time * 1000),
      onLoadError: e => fail(new Error(String(e?.data ?? e))) });
  }), { src: `/app/${file}`, artboard, animation, stateMachine, time, size });
  return trim(await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: box.w, height: box.h } }), { keyBackground: !keepBackground });
}

/**
 * Removes a flat artboard background: when the corners of the drawn area share one colour,
 * everything of that colour reachable from the edges becomes transparent (the mascot's own
 * outline stops the fill).
 */
export function keyFlatBackground(width, height, rgba) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (rgba[(y * width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return false;
  const at = (x, y) => (y * width + x) * 4;
  const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [...rgba.subarray(at(x, y), at(x, y) + 4)]);
  const far = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) > 10;
  if (corners.some(c => c[3] < 250 || far(c, corners[0]))) return false;
  const bg = corners[0], seen = new Uint8Array(width * height), stack = [];
  for (let x = x0; x <= x1; x++) stack.push([x, y0], [x, y1]);
  for (let y = y0; y <= y1; y++) stack.push([x0, y], [x1, y]);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < x0 || x > x1 || y < y0 || y > y1 || seen[y * width + x]) continue;
    seen[y * width + x] = 1;
    const i = at(x, y);
    if (far([rgba[i], rgba[i + 1], rgba[i + 2]], bg)) continue;
    rgba[i + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return true;
}

/** An SVG whose viewBox is the bounding box of what it draws (plus 2 %). */
async function tightSvg(page, text) {
  const box = await page.evaluate(svgText => {
    document.body.innerHTML = svgText;
    const svg = document.querySelector('svg');
    if (!svg) return null;
    const b = svg.getBBox();
    return b.width && b.height ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;
  }, text);
  if (!box) return text;
  const m = Math.max(box.width, box.height) * 0.02, vb = [box.x - m, box.y - m, box.width + 2 * m, box.height + 2 * m].map(v => +v.toFixed(2));
  return text.replace(/<svg\b[^>]*>/, tag => tag.replace(/\s(viewBox|width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/^<svg/, `<svg viewBox="${vb.join(' ')}" width="${vb[2]}" height="${vb[3]}"`));
}

/**
 * Crops a transparent PNG to its visible pixels (plus a 2 % margin), optionally keying a flat
 * background first. haze clears alpha up to that value first (the faint veil a cut leaves).
 */
export function trim(buf, { keyBackground = false, haze = 0 } = {}) {
  const { width, height, rgba } = decodePng(buf);
  if (keyBackground) keyFlatBackground(width, height, rgba);
  if (haze) for (let k = 3; k < rgba.length; k += 4) if (rgba[k] <= haze) rgba[k] = 0;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (rgba[(y * width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return buf;
  const m = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(width - 1, x1 + m); y1 = Math.min(height - 1, y1 + m);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(rgba.subarray(((y + y0) * width + x0) * 4, ((y + y0) * width + x1 + 1) * 4), y * w * 4);
  return encodePng(w, h, out, { alpha: true });
}

const poseKey = a => createHash('sha1').update(JSON.stringify([a.rive, a.artboard, a.animation, a.stateMachine, a.time, a.size, a.keepBackground])).digest('hex').slice(0, 10);

/**
 * File URLs for store/assets.json ids, rendering Rive poses on first use (cached in
 * output/assets/rive/). Used by `render` for <img data-asset="id">.
 */
export async function resolveAssets(store, browser, log = console.error) {
  const file = join(store.dir, 'assets.json');
  if (!existsSync(file)) return {};
  const { assets = [] } = JSON.parse(readFileSync(file, 'utf8'));
  const root = appRootOf(store), out = {};
  let page = null;
  try {
    for (const a of assets) {
      if (!a.id) continue;
      if (a.rive) {
        const png = join(store.paths.out, 'assets', 'rive', `${a.id}-${poseKey(a)}.png`);
        if (!existsSync(png)) {
          page ??= await rivePage(browser, root);
          mkdirSync(dirname(png), { recursive: true });
          writeFileSync(png, await rivePose(page, a.rive, a));
          log(`rendered Rive pose ${a.id}`);
        }
        out[a.id] = pathToFileURL(png).href;
      } else if (a.file) {
        const path = a.file.startsWith('store/') ? resolve(store.dir, a.file.slice(6)) : resolve(root, a.file);
        if (!existsSync(path)) { log(`! asset ${a.id}: ${path} not found`); continue; }
        // Art is cropped to what it draws (empty margins make it look small and misplaced);
        // scenes and textures (role backdrop, or "tight": false) keep their frame.
        const tight = a.tight ?? !['backdrop', 'background', 'texture', 'scene'].includes(a.role);
        const safe = webSafe(path, join(store.paths.out, 'assets', 'svg'));
        if (!tight) { out[a.id] = pathToFileURL(safe).href; continue; }
        const key = createHash('sha1').update(readFileSync(safe)).digest('hex').slice(0, 10);
        const ext = extname(safe).toLowerCase(), tightFile = join(store.paths.out, 'assets', 'tight', `${a.id}-${key}${ext === '.svg' ? '.svg' : ext === '.png' ? '.png' : ext}`);
        if (!existsSync(tightFile)) {
          mkdirSync(dirname(tightFile), { recursive: true });
          if (ext === '.png') writeFileSync(tightFile, trim(readFileSync(safe)));
          else if (ext === '.svg') { page ??= await browser.newPage(); writeFileSync(tightFile, await tightSvg(page, readFileSync(safe, 'utf8'))); }
          else writeFileSync(tightFile, readFileSync(safe));
        }
        out[a.id] = pathToFileURL(tightFile).href;
      }
    }
  } finally { await page?.close(); }
  return out;
}

/**
 * `storeshots assets`: scan the app repo, list fonts, colours, Rive and Lottie files, and
 * draw numbered contact sheets of its art → output/assets/sheet-N.png + index.json.
 * `--rive <file>`: every artboard × animation of one Rive file at a few times, on a sheet.
 */
export async function assets(store, { rive: riveFile, dir, log = console.error } = {}) {
  const root = appRootOf(store), outDir = join(store.paths.out, 'assets');
  mkdirSync(outDir, { recursive: true });
  const browser = await launchBrowser();
  try {
    if (riveFile) {
      const rel = relative(root, resolve(root, riveFile));
      const page = await rivePage(browser, root);
      const contents = await riveContents(page, rel);
      const poses = [];
      for (const board of contents.artboards ?? []) {
        const plays = [...(board.animations ?? []).map(a => ({ animation: a })), ...(board.stateMachines ?? []).map(s => ({ stateMachine: s.name }))];
        for (const play of plays.length ? plays : [{}]) for (const time of [0.1, 0.6, 1.5]) {
          const pose = { artboard: board.name, ...play, time, size: 800 };
          const png = join(outDir, 'rive', `${basename(rel, '.riv')}-${poseKey({ rive: rel, ...pose })}.png`);
          mkdirSync(dirname(png), { recursive: true });
          writeFileSync(png, await rivePose(page, rel, pose));
          poses.push({ n: poses.length + 1, ...pose, png });
        }
      }
      await page.close();
      const sheet = join(outDir, `rive-${basename(rel, '.riv')}.png`);
      const html = sheetHTML(poses.map(p => ({ kind: 'image', n: p.n, name: `${p.artboard} · ${p.animation ?? p.stateMachine ?? '-'} · ${p.time}s`, file: p.png, width: 800, height: 800 })), '/', {});
      await shoot(browser, html, sheet);
      writeFileSync(join(outDir, `rive-${basename(rel, '.riv')}.json`), JSON.stringify({ file: rel, contents, poses }, null, 2));
      log(`${poses.length} poses of ${rel} → ${sheet}`);
      return { file: rel, contents, poses: poses.map(({ png, ...p }) => p), sheet };
    }

    const found = scanAssets(root, { dir });
    // Rive files join the sheet with a default pose.
    const riveThumbs = {};
    if (found.rive.length) {
      const page = await rivePage(browser, root);
      for (const f of found.rive) {
        try {
          const png = join(outDir, 'rive', `${basename(f, '.riv')}-thumb.png`);
          mkdirSync(dirname(png), { recursive: true });
          writeFileSync(png, await rivePose(page, f, { size: 500 }));
          riveThumbs[f] = pathToFileURL(png).href;
        } catch (e) { log(`! ${f}: ${e.message}`); }
      }
      await page.close();
      const start = found.art.length;
      found.art.push(...found.rive.map((f, i) => ({ kind: 'rive', n: start + i + 1, file: f, name: basename(f) })));
    }
    const sheets = [];
    for (let i = 0; i < found.art.length; i += PER_SHEET) {
      const sheet = join(outDir, `${dir ? `dir-${dir.replace(/[^\w]+/g, '-')}-` : 'sheet-'}${sheets.length + 1}.png`);
      await shoot(browser, sheetHTML(found.art.slice(i, i + PER_SHEET), root, riveThumbs, join(outDir, 'svg')), sheet);
      sheets.push(sheet);
    }
    writeFileSync(join(outDir, dir ? `dir-${dir.replace(/[^\w]+/g, '-')}.json` : 'index.json'), JSON.stringify(found, null, 2));
    log(`${found.art.length} pieces of art (${found.art.filter(a => a.kind === 'group').length} groups), ${found.rive.length} Rive, ${found.lottie.length} Lottie, ${found.fonts.files.length} font files → ${sheets.length} sheet(s) in ${outDir}`);
    return { root, index: join(outDir, 'index.json'), sheets, icon: found.icon, accent: found.accent, colours: found.colours, fonts: found.fonts, rive: found.rive, lottie: found.lottie, art: found.art.length,
      next: 'look at the sheets (expand a group with --dir <folder>), then write store/assets.json: {"assets": [{"id", "file" | "rive" (+ artboard, animation | stateMachine, time), "role", "fits", "notes"}]}' };
  } finally {
    await browser.close();
  }
}

async function shoot(browser, html, out) {
  const page = await browser.newPage({ viewport: { width: 1728, height: 800 } });
  const tmp = `${out}.html`;
  writeFileSync(tmp, html);
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
}
