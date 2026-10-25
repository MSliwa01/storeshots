// `storeshots import <files|dirs>`: bring screenshots made elsewhere (Xcode, fastlane
// snapshot, a device, an Android emulator) into output/raw/ as if `capture` had made them.
// Files map to shots by name (hero.png → shot "hero"), the rest in order. A screenshot with
// the device's aspect ratio is scaled to its exact canvas; any other ratio is refused.
// Screen recordings (.mp4, .mov, .m4v, .webm) are kept as they are, next to a still of their
// first second, for `storeshots video`.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { usage } from './errors.mjs';
import { ocr } from './elements.mjs';
import { slidesOf } from './styles.mjs';

const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const VIDEOS = new Set(['.mp4', '.mov', '.m4v', '.webm']);
const usable = f => IMAGES.has(extname(f).toLowerCase()) || VIDEOS.has(extname(f).toLowerCase());
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });

function expand(paths) {
  const files = [];
  for (const p of paths) {
    if (!existsSync(p)) throw usage(`not found: ${p}`);
    if (statSync(p).isDirectory()) files.push(...readdirSync(p).filter(usable).sort(natural).map(f => join(p, f)));
    else if (usable(p)) files.push(p);
  }
  return files;
}

/** Width and height as shown (a recording rotated by its metadata reports them swapped). */
function size(file) {
  const out = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-of', 'json', file], { encoding: 'utf8' }));
  const s = out.streams?.[0] ?? {};
  const rotation = Math.abs(Number(s.tags?.rotate ?? s.side_data_list?.find(d => d.rotation != null)?.rotation ?? 0)) % 180;
  return rotation === 90 ? [s.height, s.width] : [s.width, s.height];
}
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
  if (!files.length) throw usage('no images or recordings to import', { fix: 'storeshots import <files or folders of PNG/JPG, or MP4/MOV screen recordings>' });
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
        fix: `capture at the ${device.label ?? device.id} ratio (${device.width}×${device.height}), or pass --device for another slot`,
      });
    }
    const out = store.rawShot(device.id, lang, shot);
    mkdirSync(dirname(out), { recursive: true });
    if (VIDEOS.has(extname(file).toLowerCase())) {
      // A recording: kept whole (frames are cut at the video's own frame rate when it renders),
      // plus a still from its first second when the shot has none yet.
      const clip = out.replace(/\.png$/, extname(file).toLowerCase());
      for (const ext of VIDEOS) rmSync(out.replace(/\.png$/, ext), { force: true });
      copyFileSync(file, clip);
      const still = at => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', at, '-i', file, '-frames:v', '1', '-vf', `scale=${device.width}:${device.height}:flags=lanczos`, '-pix_fmt', 'rgb24', out]);
      if (!existsSync(out)) { still('1'); if (!existsSync(out)) still('0'); }
      imported.push({ file, shot, size: `${w}×${h}`, clip });
      log(`imported ${basename(file)} → ${shot} (recording)`);
      continue;
    }
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
