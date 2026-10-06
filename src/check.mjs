// Hard store rules on the rendered files, plus the readability rules from
// docs/research/design.md that a render report can measure.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pngInfo } from './png.mjs';

const HEADLINE_MIN = 0.06; // of the canvas width: below this it is unreadable in search
const HEADLINE_TARGET = 0.09; // top apps use 9–12%
const TEXT_MIN = 0.04; // any caption text below this is unreadable on the product page
const TEXT_TARGET = 0.05;

export function check(store, { devices, locales, log = console.error }) {
  const errors = [], warnings = [];
  const counts = {};
  const manifest = { generatedAt: new Date().toISOString(), app: store.app.name, sets: [] };
  for (const deviceId of devices) {
    const device = store.device(deviceId);
    for (const locale of locales) {
      const where = `${deviceId}/${locale}`, dir = join(store.paths.final, deviceId, locale);
      const files = existsSync(dir) ? readdirSync(dir).filter(f => /^\d+-.+\.png$/.test(f)).sort() : [];
      counts[where] = files.length;
      if (!files.length) { errors.push(`${where}: no screenshots rendered`); continue; }
      if (files.length > 10) errors.push(`${where}: ${files.length} screenshots, App Store allows at most 10`);
      if (files.length < 3) warnings.push(`${where}: only ${files.length} screenshot(s); search results show 3`);

      const set = { device: deviceId, locale, displayType: device.asc, files: [] };
      manifest.sets.push(set);
      for (const file of files) {
        const buf = readFileSync(join(dir, file)), info = pngInfo(buf);
        set.files.push({ file: join(dir, file), slide: file.replace(/^\d+-|\.png$/g, ''), width: info.width, height: info.height, alpha: info.hasAlpha, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') });
        if (info.width !== device.width || info.height !== device.height) errors.push(`${where}/${file}: ${info.width}×${info.height}, expected ${device.width}×${device.height}`);
        if (info.hasAlpha) errors.push(`${where}/${file}: has an alpha channel (colour type ${info.colorType})`);
        const mb = statSync(join(dir, file)).size / 1e6;
        if (mb > 8) warnings.push(`${where}/${file}: ${mb.toFixed(1)} MB`);
      }

      const reportFile = join(dir, 'report.json');
      if (!existsSync(reportFile)) { warnings.push(`${where}: no render report`); continue; }
      const report = JSON.parse(readFileSync(reportFile, 'utf8'));
      for (const p of report.problems) (p.warn ? warnings : errors).push(`${where}: ${p.type} ${JSON.stringify(p)}`);
      for (const t of report.texts) {
        const at = `${where} ${t.slide} "${t.key}"`;
        if (t.overflow) errors.push(`${at}: text does not fit its box even at ${Math.round(t.fontSize)}px`);
        if (t.outsideSlide) errors.push(`${at}: text crosses the slide edge`);
        if (t.role === 'title' && t.fontSize < device.width * HEADLINE_MIN) errors.push(`${at}: headline ${Math.round(t.fontSize)}px is under ${Math.round(device.width * HEADLINE_MIN)}px (6% of width), unreadable in search`);
        else if (t.role === 'title' && t.fontSize < device.width * HEADLINE_TARGET) warnings.push(`${at}: headline ${Math.round(t.fontSize)}px is under ${Math.round(device.width * HEADLINE_TARGET)}px (9% of width); top apps use 9–12%`);
        if (t.role === 'title' && t.lines > 2) warnings.push(`${at}: headline wraps to ${t.lines} lines; keep it to two`);
        if (t.role === 'sub' && t.lines > 1) warnings.push(`${at}: subtitle wraps to ${t.lines} lines; keep it to one`);
        if (t.role === 'title' && t.fontSize < t.startSize - 0.5) warnings.push(`${at}: headline shrank ${Math.round(t.startSize)}→${Math.round(t.fontSize)}px to fit; shorten the copy instead`);
        // WCAG: 3:1 for large text (headlines, accents) is the floor, 4.5:1 for body text.
        if (typeof t.contrast === 'number') {
          const large = t.role === 'title' || t.role === 'accent' || t.fontSize >= device.width * 0.07;
          if (t.contrast < (large ? 3 : 3.5)) errors.push(`${at}: contrast ${t.contrast}:1 against its background (need ≥ ${large ? 3 : 4.5}:1)`);
          else if (t.contrast < 4.5) warnings.push(`${at}: contrast ${t.contrast}:1 (aim for ≥ 4.5:1)`);
        }
        if (t.role === 'accent') continue;
        if (t.role !== 'title' && t.fontSize < device.width * TEXT_MIN) errors.push(`${at}: ${Math.round(t.fontSize)}px text is too small to read (min ${Math.round(device.width * TEXT_MIN)}px); make it bigger or cut it`);
        else if (t.role !== 'title' && t.fontSize < device.width * TEXT_TARGET) warnings.push(`${at}: ${Math.round(t.fontSize)}px text is small (aim for ≥ ${Math.round(device.width * TEXT_TARGET)}px)`);
      }
      const titleSizes = new Set(report.texts.filter(t => t.role === 'title').map(t => Math.round(t.fontSize)));
      if (titleSizes.size > 1) warnings.push(`${where}: headline sizes differ across the set (${[...titleSizes].join(', ')} px); keep one size`);
      const titleLines = new Set(report.texts.filter(t => t.role === 'title').map(t => t.lines));
      if (titleLines.size > 1) warnings.push(`${where}: headlines have ${[...titleLines].sort().join(' and ')} lines; give every headline two (a \\n in the copy) so captions and phones line up`);
      // Phones: one size per set (3D poses and the closer's fan aside), and none floating in
      // the middle of a slide: a flat phone runs off the bottom edge or hangs from the top.
      // (Poses aside: a tilted phone is 90 % of the others, 3D phones are sized by their camera.)
      const flat = (report.devices ?? []).filter(d => d.layout !== 'fan' && !['tilt', 'lay', 'lean'].includes(d.layout));
      for (const d of (report.devices ?? []).filter(d => d.visible && d.layout !== 'fan')) {
        const margin = Math.min(d.visible[0], d.slideWidth - d.visible[1]);
        if (margin >= 0 && margin < d.slideWidth * 0.03 && d.layout !== 'hang') warnings.push(`${where} ${d.slide}: the phone comes within ${margin} px of the slide's edge; it will read as touching the next slide`);
      }
      const widths = flat.map(d => d.width);
      if (widths.length > 1 && Math.max(...widths) / Math.min(...widths) > 1.03) warnings.push(`${where}: phone sizes differ across the set (${[...new Set(widths.map(Math.round))].join(', ')} px); keep one size and vary position and pose`);
      // Pop-outs stick out evenly on both sides, or stay clearly inside the phone; never one
      // side only, never flush with the bezel.
      for (const p of report.pops ?? []) {
        const at = `${where} ${p.slide}`, tol = Math.max(4, p.phone * 0.01), flush = p.phone * 0.015;
        if ((p.left > tol || p.right > tol) && Math.abs(p.left - p.right) > tol) warnings.push(`${at}: the pop-out sticks out unevenly (${p.left} px left, ${p.right} px right)`);
        else if (Math.abs(p.left) < flush || Math.abs(p.right) < flush) warnings.push(`${at}: the pop-out is flush with the phone's edge; let it stick out or sit inside`);
      }
      for (const d of (report.devices ?? []).filter(d => d.layout !== 'fan' && !['tilt', 'lay'].includes(d.layout))) {
        const margin = d.slideHeight * 0.01;
        if (d.top > margin && d.bottom < d.slideHeight - margin) warnings.push(`${where} ${d.slide}: the phone floats inside the slide; let it run off the bottom or hang from the top`);
      }
    }
  }
  const sizes = new Set(Object.values(counts).filter(Boolean));
  if (sizes.size > 1) warnings.push(`screenshot counts differ between sets: ${JSON.stringify(counts)}`);

  for (const e of errors) log(`ERROR  ${e}`);
  for (const w of warnings) log(`warn   ${w}`);
  log(errors.length ? `check failed: ${errors.length} error(s), ${warnings.length} warning(s)` : `check ok${warnings.length ? ` (${warnings.length} warning(s))` : ''}`);
  // The run manifest: what an agent reads instead of walking output/.
  Object.assign(manifest, { ok: !errors.length, errors, warnings });
  const manifestFile = join(store.paths.final, '..', 'manifest.json');
  try { writeFileSync(manifestFile, JSON.stringify(manifest, null, 2)); } catch { /* final dir may not exist yet */ }
  return { ok: !errors.length, errors, warnings, manifest: manifestFile, sets: manifest.sets.map(s => ({ device: s.device, locale: s.locale, count: s.files.length })) };
}
