// `storeshots import <files|dirs>`: bring screenshots made elsewhere (Xcode, fastlane
// snapshot, a device, an Android emulator) into output/raw/ as if `capture` had made them.
// Files map to shots by name (hero.png → shot "hero"), the rest in order. A screenshot with
// the device's aspect ratio is scaled to its exact canvas; any other ratio is refused.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { usage } from './errors.mjs';
import { ocr } from './elements.mjs';
import { slidesOf } from './styles.mjs';

const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });

function expand(paths) {
  const files = [];
  for (const p of paths) {
    if (!existsSync(p)) throw usage(`not found: ${p}`);
    if (statSync(p).isDirectory()) files.push(...readdirSync(p).filter(f => IMAGES.has(extname(f).toLowerCase())).sort(natural).map(f => join(p, f)));
    else if (IMAGES.has(extname(p).toLowerCase())) files.push(p);
  }
  return files;
}

const size = file => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim().split(',').map(Number);
const key = file => basename(file, extname(file)).toLowerCase().replace(/^\d+[-_. ]*/, '');

/** Is "9:41" in the status bar? null when it cannot be told (no tesseract). */
function statusTime(file, height) {
  const crop = join(tmpdir(), `storeshots-status-${process.pid}.png`);
  try {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', file, '-vf', `crop=iw:${Math.round(height * 0.055)}:0:0`, crop]);
    const words = ocr(crop, 'en');
    return words ? words.some(w => /9[:.]41/.test(w.text)) : null;
  } catch { return null; } finally { rmSync(crop, { force: true }); }
}

export function importShots(store, paths, { device: deviceId, locale, shots: only, log = console.error } = {}) {
  const files = expand(paths);
  if (!files.length) throw usage('no images to import', { fix: 'storeshots import <files or folders of PNG/JPG>' });
  const device = store.device(deviceId ?? store.devices[0]);
  const lang = locale ?? store.locales[0];
  const order = only ?? [...new Set([...slidesOf(store.config).map(s => s.shot).filter(Boolean), ...Object.keys(store.shots)])];
  if (!order.length) throw usage('no shots in screenshots.json', { fix: 'declare "shots" (or "slides"), or pass --shots a,b,c' });

  // By name first, then the remaining files fill the remaining shots in order.
  const assigned = new Map();
  for (const f of files) if (order.includes(key(f)) && ![...assigned.values()].includes(key(f))) assigned.set(f, key(f));
  const free = order.filter(s => ![...assigned.values()].includes(s));
  for (const f of files) if (!assigned.has(f) && free.length) assigned.set(f, free.shift());
  const skipped = files.filter(f => !assigned.has(f));

  const target = device.width / device.height, imported = [], warnings = [];
  for (const [file, shot] of assigned) {
    const [w, h] = size(file);
    if (Math.abs(w / h - target) / target > 0.02) {
      throw usage(`${basename(file)} is ${w}×${h}; ${device.label ?? device.id} needs ${device.width}×${device.height} (or the same ratio)`, {
        fix: device.id.startsWith('iphone') ? 'capture on a 6.9" iPhone (16/17/18 Pro Max) simulator, or pass --device for another slot' : 'capture at the device\'s ratio',
      });
    }
    const out = store.rawShot(device.id, lang, shot);
    mkdirSync(dirname(out), { recursive: true });
    const scaled = w !== device.width || h !== device.height;
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', file, ...(scaled ? ['-vf', `scale=${device.width}:${device.height}:flags=lanczos`] : []), '-pix_fmt', 'rgb24', out]);
    const time = statusTime(out, device.height);
    if (time === false) warnings.push(`${shot}: no 9:41 in the status bar (App Store sets use 9:41; xcrun simctl status_bar … override --time 9:41)`);
    imported.push({ file, shot, size: `${w}×${h}`, ...(scaled ? { scaled: `${device.width}×${device.height}` } : {}), out });
    log(`imported ${basename(file)} → ${shot}${scaled ? ` (scaled from ${w}×${h})` : ''}`);
  }
  for (const w of warnings) log(`  ! ${w}`);
  return {
    device: device.id, locale: lang, imported, warnings,
    ...(skipped.length ? { skipped: skipped.map(f => basename(f)), fix: 'more images than shots: add shots to screenshots.json or pass --shots' } : {}),
    next: 'storeshots elements (pick pop-outs), then storeshots style and storeshots build',
  };
}
