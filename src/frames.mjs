// Apple product bezels. The license allows them in screenshots of your own app but
// forbids redistribution, so they are downloaded into frames/ (gitignored) and never
// committed. Each colour gets a measured screen opening in frames/<model>/meta.json.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng } from './png.mjs';
import { DATA_DIR } from './paths.mjs';
import { CliError, EXIT, usage } from './errors.mjs';

export const FRAMES_DIR = process.env.STORESHOTS_FRAMES ?? join(DATA_DIR, 'frames');
const CDN = 'https://devimages-cdn.apple.com/design/resources/download/';

/** Model id → the DMG on developer.apple.com/design/resources and its PNG folder. */
export const CATALOG = {
  'iphone-18-pro-max': { dmg: 'Bezel-iPhone-18.dmg', folder: 'Bezel-iPhone-18/PNG/iPhone 18 Pro Max' },
  'iphone-18-pro': { dmg: 'Bezel-iPhone-18.dmg', folder: 'Bezel-iPhone-18/PNG/iPhone 18 Pro' },
  'ipad-pro-13-m5': { dmg: 'Bezel-iPad-Pro-(M5).dmg', folder: null }, // folder found by listing the DMG
};

const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Downloads and extracts the portrait PNGs of one model, then measures them. */
export function installFrames(model) {
  const entry = CATALOG[model];
  if (!entry) throw usage(`unknown frame model "${model}"`, { fix: `known: ${Object.keys(CATALOG).join(', ')}` });
  const downloads = join(FRAMES_DIR, '_dl'), dmg = join(downloads, entry.dmg), out = join(FRAMES_DIR, model);
  mkdirSync(downloads, { recursive: true });
  if (!existsSync(dmg)) {
    console.error(`downloading ${entry.dmg} from Apple Design Resources.\n`
      + 'Apple product bezels are licensed for depicting your own app (screenshots, marketing) and may not be\n'
      + 'redistributed: https://developer.apple.com/design/resources/ — they stay in ' + FRAMES_DIR);
    execFileSync('curl', ['-sSfL', '-o', dmg, CDN + encodeURIComponent(entry.dmg).replace(/%28/g, '(').replace(/%29/g, ')')], { stdio: 'inherit' });
  }
  let folder = entry.folder;
  if (!folder) {
    const listing = execFileSync('7z', ['l', '-slt', dmg], { encoding: 'utf8', maxBuffer: 64 << 20 });
    const pngs = [...listing.matchAll(/^Path = (.+Portrait\.png)$/gm)].map(m => m[1]).filter(p => /\/PNG\//.test(p) && /13/.test(p));
    if (!pngs.length) throw new CliError(`no 13" portrait PNGs in ${entry.dmg}`, { exit: EXIT.RUN });
    folder = pngs[0].slice(0, pngs[0].lastIndexOf('/'));
  }
  const tmp = join(downloads, `${model}.tmp`);
  rmSync(tmp, { recursive: true, force: true });
  execFileSync('7z', ['e', '-y', `-o${tmp}`, dmg, `${folder}/*Portrait.png`], { stdio: 'ignore' });
  mkdirSync(out, { recursive: true });
  for (const file of readdirSync(tmp).filter(f => f.endsWith('Portrait.png'))) {
    // "iPhone 18 Pro Max - Black - Portrait.png" → black.png
    const colour = slug(file.split(' - ').slice(-2, -1)[0] ?? file);
    renameSync(join(tmp, file), join(out, `${colour}.png`));
  }
  rmSync(tmp, { recursive: true, force: true });
  return measureFrames(model);
}

/**
 * Finds the transparent screen opening by flood-filling from the centre, so the
 * capture can sit exactly under the bezel whatever the model's proportions.
 */
export function measureBezel(file) {
  const { width, height, rgba } = decodePng(readFileSync(file));
  const transparent = i => rgba[i * 4 + 3] < 128;
  const seen = new Uint8Array(width * height), stack = [((height >> 1) * width) + (width >> 1)];
  if (!transparent(stack[0])) throw new Error(`${file}: centre pixel is not transparent`);
  let left = width, right = 0, top = height, bottom = 0;
  while (stack.length) {
    const i = stack.pop();
    if (seen[i] || !transparent(i)) continue;
    seen[i] = 1;
    const x = i % width, y = (i - x) / width;
    if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y;
    if (x > 0) stack.push(i - 1); if (x < width - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - width); if (y < height - 1) stack.push(i + width);
  }
  // Corner radius: where the opening starts on its first row.
  let firstOpen = left;
  while (firstOpen < right && !seen[top * width + firstOpen]) firstOpen++;
  return { width, height, screen: { x: left, y: top, width: right - left + 1, height: bottom - top + 1, radius: firstOpen - left } };
}

export function measureFrames(model) {
  const dir = join(FRAMES_DIR, model), meta = {};
  for (const file of readdirSync(dir).filter(f => f.endsWith('.png'))) meta[file.replace('.png', '')] = measureBezel(join(dir, file));
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  return meta;
}

/** "iphone-18-pro-max/black" → { file, width, height, screen }, installing the model on first use. */
export function frame(name) {
  const [model, colour] = name.split('/');
  const metaFile = join(FRAMES_DIR, model, 'meta.json');
  if (!existsSync(metaFile)) installFrames(model);
  const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
  const chosen = colour ?? Object.keys(meta)[0];
  if (!meta[chosen]) throw usage(`frame "${name}": no colour "${chosen}"`, { fix: `colours: ${Object.keys(meta).join(', ')}` });
  return { name: `${model}/${chosen}`, file: join(FRAMES_DIR, model, `${chosen}.png`), ...meta[chosen] };
}

/**
 * A drawn device frame (SVG): works offline, needs no Apple download and may appear anywhere
 * (READMEs, CI). Its geometry copies the measured Apple bezel (iPhone: 1470×3000 around a
 * 1320×2868 screen at 75,66), so compositions land in the same place with either frame.
 */
export const GENERIC_COLOURS = { black: { body: '#1c1d20', edge: '#3b3d43', button: '#2a2b30' }, silver: { body: '#d7d8dd', edge: '#f4f5f7', button: '#bfc0c6' } };

export function genericFrame(device, colour = 'black') {
  const c = GENERIC_COLOURS[colour] ?? GENERIC_COLOURS.black;
  const W = device.width, H = device.height, phone = H / W > 1.7;
  // Ratios from the Apple iPhone bezel: 75 px side (incl. 12 px buttons), 66 px top, radius 212.
  const side = Math.round(W * (phone ? 75 / 1320 : 0.045)), top = Math.round(W * (phone ? 66 / 1320 : 0.045));
  const button = phone ? Math.round(W * (12 / 1320)) : 0, bezel = side - button;
  const radius = Math.round(W * (phone ? 212 / 1320 : 0.03)), fw = W + 2 * side, fh = H + 2 * top;
  const sx = side, sy = top, ring = Math.round(W * 0.012);
  const rr = (x, y, w, h, r) => `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  const body = [button, sy - bezel, fw - 2 * button, H + 2 * bezel, radius + bezel];
  const hole = rr(sx, sy, W, H, radius);
  const buttons = phone ? [
    [0, sy + H * 0.17, button + 2, H * 0.045], [0, sy + H * 0.255, button + 2, H * 0.07], [0, sy + H * 0.34, button + 2, H * 0.07],
    [fw - button - 2, sy + H * 0.29, button + 2, H * 0.105],
  ].map(([x, y, w, h]) => `<rect x="${x}" y="${Math.round(y)}" width="${w}" height="${Math.round(h)}" rx="${button / 2}" fill="${c.button}"/>`).join('') : '';
  const island = phone ? `<rect x="${Math.round(sx + W / 2 - W * 0.143)}" y="${Math.round(sy + W * 0.025)}" width="${Math.round(W * 0.286)}" height="${Math.round(W * 0.085)}" rx="${Math.round(W * 0.0425)}" fill="#000"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fw}" height="${fh}" viewBox="0 0 ${fw} ${fh}">${buttons}`
    + `<path fill-rule="evenodd" fill="${c.body}" d="${rr(...body)} ${hole}"/>`
    + `<path fill="none" stroke="${c.edge}" stroke-width="${Math.max(2, Math.round(W * 0.003))}" d="${rr(body[0] + 2, body[1] + 2, body[2] - 4, body[3] - 4, body[4] - 2)}"/>`
    + `<path fill-rule="evenodd" fill="#000" d="${rr(sx - ring, sy - ring, W + 2 * ring, H + 2 * ring, radius + ring)} ${hole}"/>${island}</svg>`;
  return { name: `generic/${colour}`, url: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, width: fw, height: fh, screen: { x: sx, y: sy, width: W, height: H, radius }, generic: true };
}
