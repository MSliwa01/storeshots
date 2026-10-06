// Finds the UI elements of a capture that could pop out of the phone, and ranks them.
//
// App UI is a tree of flat, rounded surfaces: page → card → inner card → chip. A surface
// is a connected region of one colour whose rows all span its full width (text and
// children are holes in it), so it can be found exactly from the pixels, with its corner
// radius. Rows of same-size siblings (a calendar week, a toolbar) and adjacent pairs
// become candidates too. Status bar, tab bar and anything cut by the screen edge are
// left out or marked.
//
// Ranking is a prior, not the decision: size, colour (chips and dates are the data),
// content, position, the first of a repeated list, and, when tesseract is installed,
// how many words of the slide's headline and subtitle the element contains. The agent
// (or the user) looks at the numbered marks image and picks the element that proves
// the headline (set-of-marks prompting).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { usage } from './errors.mjs';
import { decodePng } from './png.mjs';

const TOLERANCE = 7;          // per channel, against the region's first pixel
const STATUS_BAR = 0.068;     // of the screen height
const BOTTOM_BAR = 0.085;

/** Connected regions of near-equal colour: labels per pixel and per-region stats. */
function regions({ width: W, height: H, rgba }) {
  const labels = new Int32Array(W * H).fill(-1);
  const stack = new Int32Array(W * H);
  const stats = [];
  for (let start = 0; start < W * H; start++) {
    if (labels[start] !== -1) continue;
    const id = stats.length, s = start * 4, r0 = rgba[s], g0 = rgba[s + 1], b0 = rgba[s + 2];
    let top = 0, count = 0, minX = W, maxX = 0, minY = H, maxY = 0, sr = 0, sg = 0, sb = 0;
    stack[top++] = start; labels[start] = id;
    while (top) {
      const p = stack[--top], x = p % W, y = (p - x) / W;
      count++; sr += rgba[p * 4]; sg += rgba[p * 4 + 1]; sb += rgba[p * 4 + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let k = 0; k < 4; k++) {
        const q = k === 0 ? (x > 0 ? p - 1 : -1) : k === 1 ? (x < W - 1 ? p + 1 : -1) : k === 2 ? (y > 0 ? p - W : -1) : (y < H - 1 ? p + W : -1);
        if (q < 0 || labels[q] !== -1) continue;
        const i = q * 4;
        if (Math.abs(rgba[i] - r0) <= TOLERANCE && Math.abs(rgba[i + 1] - g0) <= TOLERANCE && Math.abs(rgba[i + 2] - b0) <= TOLERANCE) {
          labels[q] = id; stack[top++] = q;
        }
      }
    }
    stats.push({ id, count, minX, maxX, minY, maxY, fill: [sr, sg, sb].map(v => Math.round(v / count)) });
  }
  return { labels, stats };
}

/** A region that is a rounded rectangle: every middle row spans its full width. */
function surface(region, labels, W) {
  const { id, minX, maxX, minY, maxY } = region, w = maxX - minX + 1, h = maxY - minY + 1;
  let filled = 0, straight = 0, middle = 0;
  for (let y = minY; y <= maxY; y++) {
    let first = -1, last = -1;
    for (let x = minX; x <= maxX; x++) if (labels[y * W + x] === id) { if (first < 0) first = x; last = x; }
    if (first >= 0) filled += last - first + 1;
    if (y > minY + h * 0.2 && y < maxY - h * 0.2) { middle++; if (first >= 0 && first - minX <= 2 && maxX - last <= 2) straight++; }
  }
  if (filled / (w * h) < 0.9 || !middle || straight / middle < 0.9) return null;
  // Corner radius from the diagonal inset of each corner (a circular corner of radius r
  // starts r·(1 − 1/√2) in along the diagonal).
  const inset = (x0, y0, dx, dy) => { for (let k = 0; k < Math.min(w, h) / 2; k++) if (labels[(y0 + dy * k) * W + x0 + dx * k] === id) return k; return 0; };
  const insets = [inset(minX, minY, 1, 1), inset(maxX, minY, -1, 1), inset(minX, maxY, 1, -1), inset(maxX, maxY, -1, -1)];
  const radius = Math.min(Math.round(Math.max(0, Math.min(...insets) - 0.5) / (1 - Math.SQRT1_2)), Math.floor(Math.min(w, h) / 2));
  return { box: [minX, minY, w, h], radius, fill: region.fill, own: region.count / (w * h) };
}

const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
const inside = (a, b, slack = 2) => a[0] >= b[0] - slack && a[1] >= b[1] - slack && a[0] + a[2] <= b[0] + b[2] + slack && a[1] + a[3] <= b[1] + b[3] + slack;
const union = boxes => {
  const x = Math.min(...boxes.map(b => b[0])), y = Math.min(...boxes.map(b => b[1]));
  return [x, y, Math.max(...boxes.map(b => b[0] + b[2])) - x, Math.max(...boxes.map(b => b[1] + b[3])) - y];
};
const overlaps = (a, b) => Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]) > 2 && Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]) > 2;
const iou = (a, b) => {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]), h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / (a[2] * a[3] + b[2] * b[3] - w * h);
};

/** Pixel measures inside a box: share of saturated pixels and of pixels unlike the fill. */
function content({ width: W, rgba }, [bx, by, bw, bh], fill) {
  let saturated = 0, detail = 0, n = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((bw * bh) / 20000)));
  for (let y = by; y < by + bh; y += step) for (let x = bx; x < bx + bw; x += step) {
    const i = (y * W + x) * 4, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max > 70 && (max - min) / max > 0.35) saturated++;
    if (fill && Math.abs(r - fill[0]) + Math.abs(g - fill[1]) + Math.abs(b - fill[2]) > 60) detail++;
    n++;
  }
  return { saturated: saturated / n, detail: detail / n };
}

/**
 * Runs of content inside `area`: consecutive rows holding pixels unlike `fill`, split where
 * at least `minGap` rows are pure fill. Each run keeps its exact extent: [x, y, w, h].
 */
function runs({ width: W, height: H, rgba }, fill, area) {
  const [ax, top, aw, ah] = area, bottom = top + ah, minGap = Math.max(6, Math.round(H * 0.003));
  const extent = y => {
    let first = -1, last = -1;
    for (let x = ax; x < ax + aw; x++) {
      const i = (y * W + x) * 4;
      if (Math.abs(rgba[i] - fill[0]) + Math.abs(rgba[i + 1] - fill[1]) + Math.abs(rgba[i + 2] - fill[2]) > 30) { if (first < 0) first = x; last = x; }
    }
    return first < 0 ? null : [first, last];
  };
  const out = [];
  let start = -1, gap = 0, minX = W, maxX = 0;
  const close = end => { out.push([minX, start, maxX - minX + 1, end - start + 1]); start = -1; minX = W; maxX = 0; };
  for (let y = top; y < bottom; y++) {
    const e = extent(y);
    if (e) { if (start < 0) start = y; gap = 0; minX = Math.min(minX, e[0]); maxX = Math.max(maxX, e[1]); }
    else if (start >= 0 && ++gap >= minGap) close(y - gap);
  }
  if (start >= 0) close(bottom - 1 - gap);
  return out;
}

/**
 * Windows of 1–3 consecutive units. A unit is a paragraph (short runs, i.e. text lines, joined
 * across line-spacing gaps, so no window ends mid-paragraph) or one tall run standing alone
 * (a calendar week, a chart, a row of tiles).
 */
function windows(list, H, maxUnits = 3) {
  const units = [];
  for (const r of list) {
    const last = units.at(-1), short = h => h < H * 0.04;
    if (last && short(r[3]) && last.short && r[1] - (last.box[1] + last.box[3]) < H * 0.012) last.box = union([last.box, r]);
    else units.push({ box: r, short: short(r[3]) });
  }
  const out = [];
  for (let i = 0; i < units.length; i++) for (let n = 1; n <= maxUnits && i + n <= units.length; n++) out.push(union(units.slice(i, i + n).map(u => u.box)));
  return out;
}

// ---- OCR (optional) -------------------------------------------------------------------
const TESS_LANG = { en: 'eng', pl: 'pol', de: 'deu', fr: 'fra', es: 'spa', it: 'ita', pt: 'por', nl: 'nld', sv: 'swe', da: 'dan', nb: 'nor', fi: 'fin', cs: 'ces', sk: 'slk', hu: 'hun', ro: 'ron', tr: 'tur', ru: 'rus', uk: 'ukr', ja: 'jpn', ko: 'kor', zh: 'chi_sim' };
let installedLangs;
export function ocrLanguages() {
  if (installedLangs === undefined) {
    try { installedLangs = execFileSync('tesseract', ['--list-langs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').slice(1).map(s => s.trim()).filter(Boolean); }
    catch { installedLangs = null; }
  }
  return installedLangs;
}

/** Words with boxes, or null without tesseract. */
export function ocr(file, locale = 'en') {
  const langs = ocrLanguages();
  if (!langs) return null;
  const wanted = [TESS_LANG[locale.split(/[-_]/)[0]], 'eng'].filter((l, i, a) => l && langs.includes(l) && a.indexOf(l) === i);
  const tsv = execFileSync('tesseract', [file, 'stdout', '--psm', '11', '-l', wanted.join('+') || 'eng', 'tsv'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 << 20 });
  return tsv.split('\n').slice(1).map(line => line.split('\t')).filter(c => c.length >= 12 && Number(c[10]) > 40 && c[11].trim())
    .map(c => ({ text: c[11].trim(), box: [Number(c[6]), Number(c[7]), Number(c[8]), Number(c[9])] }));
}

const fold = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
/** Comparable stems of the copy: words of 3+ letters (first 5 letters) and numbers. */
export const stems = text => [...new Set(fold(text).replace(/\*/g, '').split(/[^\p{L}\p{N}:]+/u).filter(w => w.length >= 3 || /\d/.test(w)).map(w => (/\d/.test(w) ? w : w.slice(0, 5))))];

// ---- main ----------------------------------------------------------------------------
/**
 * Candidates for pop-outs in one capture, best first:
 * [{ n, box: [x,y,w,h], radius, kind: card|chip|row|pair, score, why: [], text }].
 * `copy` ({ title, subtitle }) and `words` (from ocr()) are optional.
 */
export function findElements(image, { copy, words } = {}) {
  const { width: W, height: H } = image;
  const { labels, stats } = regions(image);
  const minArea = W * H * 0.0018;
  const surfaces = [];
  for (const r of stats) {
    const w = r.maxX - r.minX + 1, h = r.maxY - r.minY + 1;
    if (r.count < minArea || w * h > W * H * 0.75 || w < W * 0.06 || h < H * 0.012) continue;
    const s = surface(r, labels, W);
    if (s) surfaces.push(s);
  }
  // Tree: the parent is the smallest surface around it.
  surfaces.sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3]);
  for (const s of surfaces) s.parent = surfaces.filter(p => p !== s && p.box[2] * p.box[3] > s.box[2] * s.box[3] && inside(s.box, p.box)).at(-1) ?? null;

  // Surfaces over 40 % of the screen are containers (their bands and children are candidates), not pop-outs.
  const items = surfaces.filter(s => s.box[2] * s.box[3] <= W * H * 0.4).map(s => ({ ...s, kind: s.box[2] >= W * 0.45 ? 'card' : 'chip', cut: 'surface' }));
  const page = stats.reduce((a, b) => (b.count > a.count ? b : a)).fill;
  // Constructed pops ("frame"): content that is not one surface gets a container we draw,
  // the exact content box plus one padding on all four sides, corners concentric with the
  // content's own (child radius + padding), in the colour behind it.
  const frame = (content, kind, behind, pad, childRadius, parent, extra = {}) => ({
    box: content, pad: Math.round(pad), radius: Math.round((childRadius ?? pad * 0.9) + pad), fill: behind, behindFill: behind, parent, kind, cut: 'frame', ...extra,
  });
  // Groups: rows of ≥ 3 aligned same-size siblings, and vertically adjacent pairs; the
  // padding is the gutter between the siblings, so the group reads as a piece of the screen.
  const siblings = new Map();
  for (const s of surfaces) { const k = s.parent ?? 'root'; siblings.set(k, [...(siblings.get(k) ?? []), s]); }
  for (const group of siblings.values()) {
    const rows = new Map();
    for (const s of group) {
      const key = [...rows.keys()].find(k => Math.abs(k[0] - s.box[1]) <= 4 && Math.abs(k[1] - s.box[3]) <= 4);
      if (key) rows.get(key).push(s); else rows.set([s.box[1], s.box[3]], [s]);
    }
    for (const row of rows.values()) if (row.length >= 3) {
      row.sort((a, b) => a.box[0] - b.box[0]);
      const gutter = Math.min(...row.slice(1).map((s, i) => s.box[0] - (row[i].box[0] + row[i].box[2])));
      items.push(frame(union(row.map(s => s.box)), 'row', row[0].parent?.fill ?? page, Math.max(14, Math.min(36, gutter)), row[0].radius, row[0].parent, { members: row.length }));
    }
    const column = group.filter(s => s.box[2] >= W * 0.3).sort((a, b) => a.box[1] - b.box[1]);
    for (let i = 0; i + 1 < column.length; i++) {
      const [a, b] = [column[i], column[i + 1]];
      const gap = b.box[1] - (a.box[1] + a.box[3]);
      if (gap >= 0 && gap < H * 0.02 && Math.abs(a.box[0] - b.box[0]) <= 6 && Math.abs(a.box[2] - b.box[2]) <= 6 && Math.abs(a.box[3] - b.box[3]) > 8)
        items.push(frame(union([a.box, b.box]), 'pair', a.parent?.fill ?? page, Math.max(14, Math.min(36, gap)), Math.min(a.radius, b.radius), a.parent));
    }
  }

  // Blocks: windows of content runs, on the page (calendar weeks, plain lists, painted or
  // hatched content) and inside tall cards (a card's key lines without its header). Inside a
  // card the padding is the card's own inner margin, so the spacing is the app's.
  const body = [0, Math.round(H * STATUS_BAR), W, Math.round(H * (1 - BOTTOM_BAR - STATUS_BAR))];
  const containers = [{ area: body, fill: page, parent: null, pad: Math.round(W * 0.022), radius: null }];
  for (const card of surfaces.filter(c => c.box[3] > H * 0.2)) {
    const [cx, cy, cw, ch] = card.box, inset = Math.round(card.radius * 0.5);
    containers.push({ area: [cx + inset, cy + inset, cw - 2 * inset, ch - 2 * inset], fill: card.fill, parent: card, card });
  }
  for (const c of containers) {
    const found = runs(image, c.fill, c.area);
    if (!found.length) continue;
    let pad = c.pad;
    if (c.card) pad = Math.max(16, Math.min(56, Math.min(...found.map(r => r[0])) - c.card.box[0]));
    // The container's horizontal extent: the card, or the screen for blocks on the page.
    const [cx0, cx1] = c.card ? [c.card.box[0], c.card.box[0] + c.card.box[2]] : [0, W];
    for (let content of windows(found, H)) {
      const [, , cw, ch] = content;
      if (ch < H * 0.03 || ch > H * 0.35 || cw < W * 0.2) continue;
      // A window equal to a whole card or surface is that surface, already a candidate; one
      // that cuts into another card mixes two things (a section title and a list row).
      if (items.some(it => it.cut !== 'frame' && iou(it.box, content) > 0.75)) continue;
      if (surfaces.some(sf => sf !== c.card && sf.box[2] >= W * 0.45 && overlaps(sf.box, content))) continue;
      // A row across the container (a week, a forecast strip, a toolbar) is laid out on the
      // container's symmetric grid, but its ink is not symmetric: a bare "15" on the left, a
      // filled "21" chip on the right. Snap it to the container's own margins on both sides,
      // so the lifted row is centred like the row in the app (and a card's slice keeps the
      // card's width).
      let blockPad = pad;
      const mL = content[0] - cx0, mR = cx1 - (content[0] + content[2]);
      if (content[2] >= (cx1 - cx0) * 0.7) {
        const m = Math.max(0, Math.min(mL, mR));
        content = [cx0 + m, content[1], cx1 - cx0 - 2 * m, content[3]];
        blockPad = c.card ? Math.max(12, Math.min(56, m)) : Math.min(pad, m);
      }
      items.push(frame(content, 'block', c.fill, blockPad, c.card ? Math.max(0, c.card.radius - blockPad) : null, c.parent));
    }
  }

  // Type size from width per character: OCR boxes of words inside pills are as tall as the
  // pill, so height overstates them.
  const typeSize = wd => wd.box[2] / Math.max(1, [...wd.text.replace(/[^\p{L}\p{N}]/gu, '')].length);
  const sized = words?.filter(wd => wd.box[1] > H * STATUS_BAR && /\p{L}{3,}|\d{2,}/u.test(wd.text)) ?? [];
  const biggest = sized.length ? Math.max(...sized.map(typeSize)) : 1;
  const copyStems = copy ? stems(`${copy.title ?? ''} ${copy.subtitle ?? ''}`) : [];
  const scored = [];
  for (const it of items) {
    const [x, y, w, h] = it.box, why = [];
    // Status bar, tab bar, home indicator; a card half under a floating tab bar is a poor pop.
    const under = Math.max(0, y + h - H * (1 - BOTTOM_BAR)) / h;
    if (y + h < H * STATUS_BAR || under > 0.4) continue;
    if (under > 0) why.push('under the tab bar');
    const area = (w * h) / (W * H);
    // Compact focus reads best when lifted: 4–15 % of the screen, falling off above.
    const sSize = area < 0.04 ? area / 0.04 : area <= 0.15 ? 1 : Math.max(0.25, 1 - (area - 0.15) / 0.25);
    const { saturated, detail } = content(image, it.box, it.fill);
    const sColour = Math.min(1, saturated / 0.04);
    const sDetail = detail < 0.04 ? detail / 0.04 : detail > 0.45 ? 0.6 : 1;
    const cy = (y + h / 2) / H, sPos = cy > 0.08 && cy < 0.78 ? 1 : 0.5;
    // Repeated list rows: the first one stands for the list.
    let sFirst = 0.8;
    if (it.kind === 'card' || it.kind === 'row') {
      const twins = items.filter(o => o !== it && o.kind === it.kind && o.parent === it.parent && Math.abs(o.box[2] - w) <= W * 0.02 && Math.abs(o.box[3] - h) <= H * 0.01);
      if (twins.length >= 2) { sFirst = twins.every(o => o.box[1] > y) ? 1 : 0.55; why.push(sFirst === 1 ? 'first of a list' : 'list row'); }
    }
    const clipped = y <= 1 || y + h >= H - 1 || x <= 0 || x + w >= W;

    let sText = null;
    // The screen's biggest words (a large date, a total, "Tomorrow") are its main fact.
    const own = words ? words.filter(wd => inside(wd.box, it.box, 4)) : [];
    const text = words ? own.map(wd => wd.text).join(' ') : undefined;
    // Relative to the screen's own largest words: the element holding them scores 1.
    const mine = own.filter(wd => sized.includes(wd));
    const big = mine.length ? (Math.max(...mine.map(typeSize)) / biggest) ** 2 : 0;
    if (big >= 0.8) why.push('big type');
    if (words && copyStems.length) {
      const found = stems(text ?? '');
      const hits = copyStems.filter(c => found.some(o => o === c || (c.length >= 4 && o.startsWith(c.slice(0, 4)))));
      // Recall of the copy's words, weighted by precision: a compact element naming the
      // headline beats a long list that happens to contain its words.
      const recall = Math.min(1, hits.length / Math.min(3, copyStems.length));
      const precision = found.length ? Math.min(1, hits.length / found.length) : 0;
      sText = recall * (0.45 + 0.55 * Math.min(1, precision * 3));
      if (hits.length) why.push(`names ${hits.join(', ')}`);
    }
    if (saturated > 0.02) why.push('colour');
    if (area > 0.3) why.push('large');
    if (clipped) why.push('cut by the screen edge');
    let score = 0.3 * sSize + 0.2 * sColour + 0.15 * sDetail + 0.1 * sPos + 0.25 * sFirst;
    if (words) score = 0.85 * score + 0.15 * Math.min(1, big);
    if (sText !== null) score = 0.7 * score + 0.3 * sText;
    if (clipped) score *= 0.35;
    if (under > 0) score *= 0.5;
    if (it.kind === 'chip') score *= 0.75;
    // The colour behind the element: what its spot shows once the pop is lifted away (and,
    // for a surface, what the kit keys out to cut the element's exact silhouette).
    const behind = it.cut === 'frame' ? it.behindFill : (it.parent?.fill ?? page);
    const cut = it.cut === 'frame' ? { cut: 'frame', pad: it.pad } : { cut: 'surface', fill: hex(it.fill) };
    scored.push({ box: it.box, radius: it.radius, behind: hex(behind), ...cut, kind: it.kind, ...(it.members ? { members: it.members } : {}), score: Math.round(score * 100) / 100, why, ...(text !== undefined ? { text } : {}) });
  }
  // Near-duplicates (a pair equal to one card, a row equal to its card): keep the better one.
  scored.sort((a, b) => b.score - a.score);
  const kept = [];
  // Windows overlap a lot ([a,b] and [a,b,c]): between two frames, 0.7 already means the same thing.
  for (const c of scored) if (!kept.some(k => iou(k.box, c.box) > (k.cut === 'frame' && c.cut === 'frame' ? 0.7 : 0.85))) kept.push(c);
  return kept.map((c, i) => ({ n: i + 1, ...c }));
}

export function findElementsInFile(file, options = {}) {
  const image = decodePng(readFileSync(file));
  const words = options.ocr === false ? null : ocr(file, options.locale);
  return { width: image.width, height: image.height, ocr: !!words, elements: findElements(image, { copy: options.copy, words }) };
}

// ---- command -------------------------------------------------------------------------
const MARK_COLOURS = ['#ff2d55', '#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#64d2ff', '#ffd60a', '#ff375f', '#5e5ce6', '#ac8e68'];
const popBox = pop => (Array.isArray(pop) ? pop : pop?.box) ?? null;

/** One image per slide with the top candidates numbered on the capture, plus all slides side by side. */
async function drawMarks(dir, entries, top = 10) {
  const { launchBrowser } = await import('./browser.mjs');
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const scale = 0.42;
    const panel = e => {
      const [W, H] = [e.width * scale, e.height * scale];
      const boxes = e.elements.slice(0, top).map((el, i) => {
        // What will pop: the container (content plus its padding) for frames, the element for surfaces.
        const pad = el.cut === 'frame' ? el.pad ?? 0 : 0;
        const [x, y, w, h] = [el.box[0] - pad, el.box[1] - pad, el.box[2] + 2 * pad, el.box[3] + 2 * pad].map(v => v * scale), c = MARK_COLOURS[i % MARK_COLOURS.length];
        return `<div class="b" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-color:${c};border-radius:${el.radius * scale}px${el.current ? ';outline:4px dashed #fff;outline-offset:3px' : ''}"><span style="background:${c}">${el.n}</span></div>`;
      }).join('');
      return `<figure><figcaption><b>${e.slide}</b> · ${escapeHtml(e.title ?? '')}</figcaption><div class="s" style="width:${W}px;height:${H}px"><img src="${pathToFileURL(e.file)}">${boxes}</div></figure>`;
    };
    const html = body => `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:24px;background:#26282e;font:600 20px/1.3 system-ui,sans-serif;color:#fff;display:flex;gap:28px;width:max-content}
      figure{margin:0} figcaption{margin:0 0 10px;max-width:560px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .s{position:relative} .s img{width:100%;height:100%;display:block;border-radius:24px;opacity:.82}
      .b{position:absolute;border:4px solid;box-sizing:border-box}
      .b span{position:absolute;left:-4px;top:-4px;min-width:40px;height:40px;padding:0 8px;border-radius:20px;color:#fff;font:800 26px/40px system-ui;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.5)}
    </style>${body}`;
    const files = [];
    const shoot = async (name, body) => {
      const file = join(dir, name);
      writeFileSync(join(dir, '.marks.html'), html(body));
      await page.goto(pathToFileURL(join(dir, '.marks.html')).href);
      await page.setViewportSize({ width: 200, height: 200 });
      const size = await page.evaluate(() => ({ width: document.body.scrollWidth, height: document.body.scrollHeight }));
      await page.setViewportSize(size);
      await page.screenshot({ path: file, fullPage: true });
      files.push(file);
      return file;
    };
    for (const e of entries) e.marks = await shoot(`${e.slide}-marks.png`, panel(e));
    const sheet = await shoot('marks.png', entries.map(panel).join(''));
    rmSync(join(dir, '.marks.html'), { force: true });
    return sheet;
  } finally {
    await browser.close();
  }
}
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * `storeshots elements`: candidates for every slide with a shot (JSON + marks images),
 * or with `pick` (a number, "best" or "none") write the chosen element as the slide's pop.
 */
export async function elements(store, { slides: only, pick, locale, device, marks = true, top = 10 } = {}) {
  const { slidesOf } = await import('./styles.mjs');
  const deviceId = device ?? store.devices[0], lang = locale ?? store.locales[0];
  const all = slidesOf(store.config);
  const chosen = all.filter(s => s.shot && (!only || only.includes(s.id)));
  if (only) for (const id of only) if (!all.some(s => s.id === id)) throw usage(`no slide "${id}"`, { fix: `slides: ${all.map(s => s.id).join(', ')}` });
  const copy = store.copy(lang);
  const dir = join(store.paths.out, 'elements');
  mkdirSync(dir, { recursive: true });

  const entries = [];
  for (const slide of chosen) {
    const file = store.rawShot(deviceId, lang, slide.shot);
    if (!existsSync(file)) throw usage(`no capture for shot "${slide.shot}" (${deviceId}/${lang})`, { fix: 'capture it first', next: `storeshots capture --shots ${slide.shot}` });
    const found = findElementsInFile(file, { copy: copy[slide.id], locale: lang });
    const current = popBox(slide.pop);
    for (const el of found.elements) if (current && iou(el.box, current) > 0.8) el.current = true;
    const entry = { slide: slide.id, shot: slide.shot, title: copy[slide.id]?.title?.replace(/\*/g, '').replace(/\n/g, ' '), file, ...found };
    writeFileSync(join(dir, `${slide.id}.json`), JSON.stringify(entry, null, 2));
    entries.push(entry);
  }

  if (pick !== undefined) {
    const config = JSON.parse(readFileSync(join(store.dir, 'screenshots.json'), 'utf8'));
    if (!Array.isArray(config.slides) || !config.slides.length) config.slides = all.map(({ id, shot }) => ({ id, shot }));
    if (pick !== 'best' && pick !== 'none' && entries.length !== 1) throw usage('a numbered pick needs one slide', { fix: 'storeshots elements --slides <id> --pick <n>' });
    const picked = [];
    for (const e of entries) {
      const target = config.slides.find(s => s.id === e.slide);
      if (pick === 'none') { delete target.pop; picked.push({ slide: e.slide, pop: null }); continue; }
      const el = pick === 'best' ? e.elements[0] : e.elements.find(x => x.n === Number(pick));
      if (!el) throw usage(`no element ${pick} on slide "${e.slide}"`, { fix: `candidates: 1–${e.elements.length}; see ${join(dir, `${e.slide}-marks.png`)}` });
      target.pop = { box: el.box, radius: el.radius, behind: el.behind, cut: el.cut, ...(el.cut === 'frame' ? { pad: el.pad } : { fill: el.fill }) };
      picked.push({ slide: e.slide, pop: target.pop, kind: el.kind, text: el.text });
    }
    writeFileSync(join(store.dir, 'screenshots.json'), JSON.stringify(config, null, 2) + '\n');
    return { picked, next: 'storeshots style <name> (regenerates design/<name>.html with the pops), then storeshots build --design design/<name>.html' };
  }

  const sheet = marks && entries.length ? await drawMarks(dir, entries, top) : null;
  return {
    device: deviceId, locale: lang, ocr: entries.some(e => e.ocr), marks: sheet,
    slides: entries.map(e => ({ slide: e.slide, shot: e.shot, title: e.title, marks: e.marks, current: e.elements.find(x => x.current)?.n ?? null,
      candidates: e.elements.slice(0, 8).map(({ n, box, radius, behind, cut, pad, kind, score, why, text }) => ({ n, box, radius, behind, cut, ...(pad ? { pad } : {}), kind, score, why, ...(text ? { text: text.slice(0, 80) } : {}) })) })),
    next: 'open the marks image, pick the element that proves each headline: storeshots elements --slides <id> --pick <n> (or --pick best)',
  };
}
