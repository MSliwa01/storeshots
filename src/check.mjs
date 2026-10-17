// Hard store rules on the rendered files, plus the readability rules from
// docs/research/design.md that a render report can measure.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pngInfo } from './png.mjs';
import { proofWarnings } from './proof.mjs';

const HEADLINE_MIN = 0.06; // of the canvas width: below this it is unreadable in search
const HEADLINE_TARGET = 0.09; // top apps use 9–12%
const TEXT_MIN = 0.04; // any caption text below this is unreadable on the product page
const TEXT_TARGET = 0.05;

const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = c => `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const lum = ([r, g, b]) => {
  const c = v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** What to change, not just what failed: a busy ground needs a calmer spot, a flat one a shade. */
export function contrastHint(t, target) {
  if (!t.ground) return '';
  if (t.ground.busy > 0.12) return `; the background behind it is busy (σ ${t.ground.busy}): move the text to a calm area or put a scrim or blur behind it`;
  if (!t.color) return `; the ground is about ${t.ground.colour}`;
  const ground = hexRgb(t.ground.colour), towards = lum(ground) > 0.18 ? [0, 0, 0] : [255, 255, 255];
  for (let k = 0.05; k <= 1.0001; k += 0.05) {
    const c = t.color.map((v, i) => v + (towards[i] - v) * k);
    if (ratio(c, ground) >= target) return `; on a ground of about ${t.ground.colour}, text ${toHex(t.color)} → ${toHex(c)} would reach ${target}:1`;
  }
  return `; the ground is about ${t.ground.colour}`;
}

// Copy that App Review rejects or that reads as filler. Other platforms are a rejection
// (guideline 2.3.10); prices go stale; "#1" and "best" need proof; clichés say nothing.
const OTHER_PLATFORMS = /\b(android|google play|play store|windows phone|huawei appgallery)\b/i;
const PRICE = /([$€£¥]\s?\d|\d\s?([$€£¥]|zł|pln|usd|eur)\b|\bfree\b|\bgratis\b|\bdarmow\w*|\bza darmo\b)/i;
const CLAIM = /(#\s?1\b|\bno\.?\s?1\b|\bnumber one\b|\bbest\b|\bnajlepsz\w*|\bnumer jeden\b|\bnr\s?1\b)/i;
const CLICHES = ['unlock', 'seamless', 'effortless', 'revolutionary', 'revolutionize', 'game-changer', 'game changer', 'all-in-one', 'next level', 'supercharge', 'elevate your', 'your ultimate', 'at your fingertips', 'like never before', 'take control of', 'odkryj', 'w zasięgu ręki', 'na wyciągnięcie ręki', 'rewolucyjn', 'bezproblemow', 'nowy wymiar', 'w jednym miejscu', 'wszystko, czego potrzebujesz', 'wszystko czego potrzebujesz', 'przenieś na wyższy poziom'];
const EMOJI = /\p{Extended_Pictographic}/u;
const CJK = /[぀-ヿ㐀-鿿가-힯]/;

// Render problems in words, with the fix (the rest print as type + JSON).
const PROBLEMS = {
  'pill-covers-letters': p => `the accent's background covers ${[...p.letters].map(c => `"${c}"`).join(' ')} of the headline by ${p.by} px; give the pill its own box with room above it (display: inline-block; margin-top) or loosen the line height`,
  'pieces-overlap': p => `two cut-outs cover each other (${p.by.join('×')} px); make them smaller, give one an \`at\`, or keep one`,
  'piece-cuts-through': p => `the cut-out [${p.crop.join(', ')}] cuts through the screen's content (${p.sides.join(', ')}); crop a whole object, its edge on calm ground (a card, a tile, a button; \`storeshots elements\` finds them)`,
  'piece-near-edge': p => `a cut-out comes within ${p.by} px of the 3 % margin of the slide; make it smaller or move it in`,
  'piece-text-small': p => `the cut-out [${p.crop.join(', ')}] has small text: its biggest line is ${p.key} % of the slide's width tall, its smallest ${p.min} % (aim for ≥ 3.5 and ≥ 2); lift a shorter element (a row, a number), crop narrower, or let it be wider`,
  'piece-wordy': p => `a cut-out holds ${p.words} words; lift one thing of 15 words or fewer (a row, a number, a chip), not a paragraph`,
  'too-many-pieces': p => `${p.count} cut-outs on one slide; two at most`,
  'art-cut-by-edge': p => `art "${p.asset}" is cut by the slide's edge by ${p.by} px; move it in or make it smaller (data-cross if that is the idea)`,
  'art-flat-edge': p => `cut-out "${p.asset}" shows the straight line where its photo was cropped (${p.sides.join(', ')}); move it so that side runs past the slide's edge, or cut a photo whose subject is whole`,
  'screen-text-cut': p => `"${p.text}" on the phone's screen is cut by the slide's edge; move or shrink the phone so the edge runs through no text`,
  'cover-hides-text': p => `the ${p.by} covers part of "${p.text}" on the phone's screen, or touches it; move it onto a calm part of the screen, or cover that text whole`,
  'piece-sliver': p => `the cut-out [${p.crop.join(', ')}] carries a ${p.by} px strip of the screen beyond the card on its ${p.side}; crop ${p.by} px tighter on that side`,
  'zoom-too-small': p => `the zoom only reaches ${p.scale}×: its focus is in the middle of a tall screen; pick a focus nearer the top or the bottom, or a smaller one`,
};

/** Rules on one text: hidden letters, glyphs, edges, words. */
function textRules(t, at, device, errors, warnings) {
  if (t.role === 'accent') return;
  if (t.fontsMissing?.length) errors.push(`${at}: font ${t.fontsMissing.map(f => `"${f}"`).join(', ')} never loaded; check the @font-face url and family name`);
  if (t.missingGlyphs) errors.push(`${at}: the font has no ${[...t.missingGlyphs].map(c => `"${c}"`).join(' ')}; they fall back to another font. Pick a font that covers this locale`);
  if (!t.behind && !t.inDevice && t.hidden) {
    const gone = t.hidden.filter(h => h.top >= 0.55 || h.share >= 0.85);
    const half = t.hidden.filter(h => !gone.includes(h));
    if (gone.length) errors.push(`${at}: letters hidden behind something drawn over them: ${gone.map(h => `"${h.c}"`).join(' ')}; move the text or the phone, or mark the text data-behind if that is the idea`);
    else if (t.role === 'title' && half.length) warnings.push(`${at}: letters half hidden behind something drawn over them: ${half.map(h => `"${h.c}"`).join(' ')}`);
    const limit = t.role === 'title' ? [0.2, 0.35] : [0, 0.08];
    if (t.hiddenShare > limit[1] && !gone.length) errors.push(`${at}: ${Math.round(t.hiddenShare * 100)} % of the text is hidden behind something drawn over it`);
    else if (limit[0] && t.hiddenShare > limit[0] && !gone.length) warnings.push(`${at}: ${Math.round(t.hiddenShare * 100)} % of the headline is hidden behind something drawn over it`);
  }
  if (!t.behind && !t.inDevice && t.overPhone >= 0.15) warnings.push(`${at}: ${Math.round(t.overPhone * 100)} % of its letters sit on top of the phone, over the app's own UI; move it off the phone or give it a solid ground`);
  if (!t.inDevice && t.letters?.length) {
    const left = Math.min(...t.letters.map(l => l.x)), right = Math.max(...t.letters.map(l => l.x + l.width)), top = Math.min(...t.letters.map(l => l.y));
    const side = Math.min(left, device.width - right);
    if (side < device.width * 0.04 && side > -device.width) warnings.push(`${at}: text comes within ${Math.max(0, Math.round(side))} px of the slide's side (keep ≥ ${Math.round(device.width * 0.04)} px, ideally 7 %)`);
    if (top >= 0 && top < device.height * 0.03) warnings.push(`${at}: text comes within ${top} px of the top edge`);
  }
  const text = (t.text ?? '').replace(/\u00a0/g, ' ').trim();
  if (!text) return;
  if (OTHER_PLATFORMS.test(text)) errors.push(`${at}: mentions another platform ("${text.match(OTHER_PLATFORMS)[0]}"); App Review rejects that (2.3.10)`);
  if (PRICE.test(text)) warnings.push(`${at}: a price or "free" ("${text.match(PRICE)[0]}"); prices go stale and differ per market, keep them out of screenshots`);
  if (CLAIM.test(text)) warnings.push(`${at}: an unprovable claim ("${text.match(CLAIM)[0]}"); show the thing instead, or cite the source`);
  const cliche = CLICHES.find(c => text.toLowerCase().includes(c));
  if (cliche) warnings.push(`${at}: "${cliche}" is filler any app could sign; say what this app does, in the user's words`);
  if (EMOJI.test(text)) warnings.push(`${at}: emoji in the copy; they render as Apple's on the device but read as filler in a caption`);
  if ((text.match(/!/g) ?? []).length > 1) warnings.push(`${at}: more than one "!"`);
  if (t.role === 'title' && !CJK.test(text)) {
    const words = text.split(/\s+/).filter(w => /\p{L}|\d/u.test(w)).length;
    if (words > 6) warnings.push(`${at}: headline has ${words} words; 3–6 read at a glance`);
    if (/\p{L}{4}/u.test(text) && text === text.toUpperCase() && text !== text.toLowerCase()) warnings.push(`${at}: headline is written in capitals in the copy; set case in CSS (text-transform) so the copy stays plain`);
  }
}

/** Rules across a slide's texts and the whole set. */
function setRules(report, where, device, errors, warnings) {
  const texts = report.texts.filter(t => t.role !== 'accent');
  // Texts running into each other, letter by letter (a box test would flag tight leading).
  const shrink = l => ({ x: l.x + l.width * 0.1, y: l.y + l.height * 0.15, r: l.x + l.width * 0.9, b: l.y + l.height * 0.85 });
  for (const [i, a] of texts.entries()) for (const b of texts.slice(i + 1)) {
    if (a.slide !== b.slide || !a.letters?.length || !b.letters?.length) continue;
    const hit = a.letters.map(shrink).some(p => b.letters.map(shrink).some(q => p.x < q.r && q.x < p.r && p.y < q.b && q.y < p.b));
    if (hit) errors.push(`${where} ${a.slide}: "${a.key}" runs into "${b.key}"`);
  }
  const bangs = texts.filter(t => t.role === 'title' && /!/.test(t.text ?? '')).length;
  if (bangs > 1) warnings.push(`${where}: ${bangs} headlines end in "!"; one at most`);
  // An empty band (no text, phone or art across the slide) over 22 % of its height reads as
  // unfinished in the search results. Measured on the render: rows with no sharp edge.
  const dark = (report.slides ?? []).filter(slide => nearBlack(slide.ground));
  if (dark.length && dark.length >= (report.slides?.length ?? 0) / 2) warnings.push(`${where}: ${dark.length} of ${report.slides.length} slides sit on a near-black ground; in the search results that reads as black and hides dark screens. Use a light ground or a deep saturated colour, unless dark is the app's whole mood`);
  for (const slide of report.slides ?? []) {
    const band = slide.emptyBand;
    if (band && band.size > device.height * 0.22) warnings.push(`${where} ${slide.id}: an empty band ${Math.round((band.size / device.height) * 100)} % of the height (from ${band.from} px); grow the phone, move the caption, or fill it`);
  }
}

/**
 * Near-black grounds read as a black hole in the search results and swallow dark app
 * screens. A deep saturated colour (navy, forest) is fine; black and dark grey are not.
 */
export const nearBlack = g => g && (g.lightness < 9 || (g.lightness < 20 && g.saturation < 30));

export function check(store, { devices, locales, log = console.error }) {
  const errors = [], warnings = [...proofWarnings(store.config?.look?.proof)];
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
      for (const p of report.problems) (p.warn ? warnings : errors).push(`${where}${p.slide ? ` ${p.slide}` : ''}: ${PROBLEMS[p.type]?.(p) ?? `${p.type} ${JSON.stringify(p)}`}`);
      for (const t of report.texts) {
        const at = `${where} ${t.slide} "${t.key}"`;
        if (t.overflow) errors.push(`${at}: text does not fit its box even at ${Math.round(t.fontSize)}px`);
        if (t.outsideSlide) errors.push(`${at}: text crosses the slide edge`);
        if (t.role === 'title' && t.fontSize < device.width * HEADLINE_MIN) errors.push(`${at}: headline ${Math.round(t.fontSize)}px is under ${Math.round(device.width * HEADLINE_MIN)}px (6% of width), unreadable in search`);
        else if (t.role === 'title' && t.fontSize < device.width * HEADLINE_TARGET) warnings.push(`${at}: headline ${Math.round(t.fontSize)}px is under ${Math.round(device.width * HEADLINE_TARGET)}px (9% of width); top apps use 9–12%`);
        if (t.role === 'title' && t.lines > (t.statement ? 3 : 2)) warnings.push(`${at}: headline wraps to ${t.lines} lines; keep it to ${t.statement ? 'three' : 'two'}`);
        if (t.role === 'sub' && t.lines > 1) warnings.push(`${at}: subtitle wraps to ${t.lines} lines; keep it to one`);
        if (t.role === 'title' && t.fontSize < t.startSize - 0.5) warnings.push(`${at}: headline shrank ${Math.round(t.startSize)}→${Math.round(t.fontSize)}px to fit; shorten the copy instead`);
        // WCAG: 3:1 for large text (headlines, accents) is the floor, 4.5:1 for body text.
        if (typeof t.contrast === 'number') {
          const large = t.role === 'title' || t.role === 'accent' || t.fontSize >= device.width * 0.07, floor = large ? 3 : 3.5;
          if (t.contrast < floor) errors.push(`${at}: contrast ${t.contrast}:1 against its background (need ≥ ${floor}:1, aim for 4.5:1)${contrastHint(t, 4.5)}`);
          else if (t.contrast < 4.5) warnings.push(`${at}: contrast ${t.contrast}:1 (aim for ≥ 4.5:1)${contrastHint(t, 4.5)}`);
        }
        textRules(t, at, device, errors, warnings);
        if (t.role === 'accent') continue;
        if (t.role !== 'title' && t.fontSize < device.width * TEXT_MIN) errors.push(`${at}: ${Math.round(t.fontSize)}px text is too small to read (min ${Math.round(device.width * TEXT_MIN)}px); make it bigger or cut it`);
        else if (t.role !== 'title' && t.fontSize < device.width * TEXT_TARGET) warnings.push(`${at}: ${Math.round(t.fontSize)}px text is small (aim for ≥ ${Math.round(device.width * TEXT_TARGET)}px)`);
      }
      setRules(report, where, device, errors, warnings);
      // Art shown bigger than its pixels goes soft: warn past 1.35×, fail past 1.6×.
      for (const img of report.images ?? []) {
        const at = `${where} ${img.slide} ${img.asset ? `asset "${img.asset}"` : img.src}`;
        if (img.upscale > 1.6) errors.push(`${at}: shown at ${img.upscale}× its ${img.natural.join('×')} px; it will look soft. Show it smaller, or find a bigger source (a vector, the original file)`);
        else if (img.upscale > 1.35) warnings.push(`${at}: shown at ${img.upscale}× its ${img.natural.join('×')} px; it may look soft`);
      }
      // A statement slide (headline: "huge") is meant to be bigger and may take a third line.
      const titleSizes = new Set(report.texts.filter(t => t.role === 'title' && !t.statement).map(t => Math.round(t.fontSize)));
      if (titleSizes.size > 1) warnings.push(`${where}: headline sizes differ across the set (${[...titleSizes].join(', ')} px); keep one size`);
      const titleLines = new Set(report.texts.filter(t => t.role === 'title' && !t.statement).map(t => t.lines));
      if (titleLines.size > 1) warnings.push(`${where}: headlines have ${[...titleLines].sort().join(' and ')} lines; give every headline two (a \\n in the copy) so captions and phones line up`);
      // Phones: one size per set (3D poses and the closer's fan aside), and none floating in
      // the middle of a slide: a flat phone runs off the bottom edge or hangs from the top.
      // (Poses aside: a tilted phone is 90 % of the others, 3D phones are sized by their camera.)
      const flat = (report.devices ?? []).filter(d => d.layout !== 'fan' && !['tilt', 'lay', 'lean', 'zoom', 'spread'].includes(d.layout));
      for (const d of (report.devices ?? []).filter(d => d.visible && !['fan', 'zoom', 'spread'].includes(d.layout))) {
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
      for (const d of (report.devices ?? []).filter(d => d.layout !== 'fan' && !['tilt', 'lay', 'zoom', 'spread'].includes(d.layout))) {
        const margin = d.slideHeight * 0.01;
        if (d.top > margin && d.bottom < d.slideHeight - margin) warnings.push(`${where} ${d.slide}: the phone floats inside the slide; let it run off the bottom or hang from the top`);
      }
    }
  }
  // Search results show the first three slides: three different screens, not one twice.
  const early = (store.config?.slides ?? []).slice(0, 3).filter(sl => sl.shot);
  for (const [k, sl] of early.entries()) {
    const twin = early.slice(k + 1).find(o => o.shot === sl.shot);
    if (twin) warnings.push(`slides "${sl.id}" and "${twin.id}" show the same screen ("${sl.shot}") in the first three, which search results show; give one of them another screen`);
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
