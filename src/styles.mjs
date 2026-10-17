// Styles: kit/styles/<name>/design.html is a page template; this module fills it with
// slides for a project. A style owns the look (type, colour, decoration); the shared
// compositions (kit/styles/compositions.css) give every set a rhythm instead of one
// phone layout repeated: hero → lean (the phone tilted) → hang (phone from the
// top, caption at the bottom) → offset (phone to one side, room for a pop-out) → … →
// closer (no phone: the app icon and a statement). Opt-in 3D layouts: tilt, lay.
//
// Slides come from screenshots.json "slides": [{ id, shot, layout?, pop?: [x,y,w,h] }]
// (pop crop in capture pixels: the UI piece the headline names), or default to one
// slide per shot. Copy keys are slide ids: copy/<locale>.json → { "<id>": { title, subtitle } }.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { usage } from './errors.mjs';
import { KIT_DIR } from './paths.mjs';
import { proofMarkup, proofSlides } from './proof.mjs';
import { fontCSS } from './fonts.mjs';
import { textIn } from './ocr.mjs';

export const STYLES_DIR = join(KIT_DIR, 'styles');
export const styles = () => readdirSync(STYLES_DIR).filter(d => existsSync(join(STYLES_DIR, d, 'design.html')));

const RHYTHM = ['hero', 'lean', 'hang', 'offset', 'hang', 'offset', 'hang', 'offset', 'hang'];

export function slidesOf(config) {
  if (Array.isArray(config.slides) && config.slides.length) return config.slides.map(s => ({ shot: s.id, ...s }));
  return Object.keys(config.shots ?? {}).map(id => ({ id, shot: id }));
}

// ---- colour -------------------------------------------------------------------------
function hexToHsl(hex) {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}
const hsl = (h, s, l) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s)}% ${Math.round(l)}%)`;

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
const rgbOf = hex => { const n = parseInt(hex.replace('#', '').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const relLum = hex => rgbOf(hex).map(v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
export const contrastOf = (a, b) => { const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** Same hue, darker until white on it reaches `target` (or lighter until `ink` does). */
function shiftFor(hex, against, target) {
  let [h, sat, l] = hexToHsl(hex), out = hex;
  const darker = relLum(against) > 0.5;
  for (let i = 0; i < 60 && contrastOf(out, against) < target; i++) { l += darker ? -1 : 1; out = hslToHex(h, sat, Math.max(0, Math.min(100, l))); }
  return out;
}
const INK = '#14161c';

/**
 * Per-slide colours: the field, the text colour with ≥ 4.5:1, and a pill (accent words) that
 * contrasts with both. `colours: 'each'` steps through the palette slide by slide (slide.bg,
 * then the palette, then hues around the brand); `'one'` keeps one field for the whole set,
 * except the accent slide (index `accentAt`), which takes the palette's second colour.
 */
export function slideColours(slides, { accent = '#3b82f6', palette: given, colours = 'each', accentAt = -1 } = {}) {
  const [h, s0] = hexToHsl(accent), sat = Math.max(55, Math.min(s0, 82));
  // Distinct neighbours (brand, then far hues), not shades of one: the set reads as a family of colours.
  const derived = [0, 200, 40, 120, -60].map(dh => hslToHex(h + dh, sat, 40));
  const palette = given?.length ? given : colours === 'one' ? [accent, derived[1]] : derived;
  return slides.map((slide, i) => {
    const bg = slide.bg ?? (colours === 'one' ? palette[i === accentAt ? 1 % palette.length : 0] : palette[i % palette.length]);
    // White text if the field reaches 4.5:1 within a small darkening, dark text otherwise.
    const [fh, fs, fl] = hexToHsl(bg);
    let field = bg;
    for (let l = fl; l >= fl - 14 && contrastOf('#ffffff', field) < 4.5; l--) field = hslToHex(fh, fs, l);
    const fg = contrastOf('#ffffff', field) >= 4.5 ? '#ffffff' : INK;
    if (fg === INK) field = bg;
    const pillBg = fg === '#ffffff' ? '#ffffff' : INK;
    const pillFg = fg === '#ffffff' ? shiftFor(field, '#ffffff', 4.5) : shiftFor(field, INK, 4.5);
    return { bg: field, fg, pillBg, pillFg, sub: fg === '#ffffff' ? 'rgba(255,255,255,.92)' : 'rgba(20,22,28,.82)', accent: i === accentAt };
  });
}

/** Brand-derived tokens every style can use. */
export function palette(accent = '#3b82f6') {
  const [h, s0] = hexToHsl(accent), s = Math.max(45, Math.min(s0, 85));
  return {
    '--brand': accent,
    '--hue': Math.round(h),
    '--deep': hsl(h, s * 0.75, 11),
    '--deep-2': hsl(h + 18, s * 0.7, 17),
    '--mid': hsl(h, s * 0.8, 30),
    '--glow-a': hsl(h, 92, 58),
    '--glow-b': hsl(h + 55, 88, 62),
    '--glow-c': hsl(h - 45, 85, 58),
    '--accent-on-dark': hsl(h, 88, 74),
    '--accent-on-light': hsl(h, Math.min(s + 10, 90), 28),
    '--paper': hsl(h, 22, 94),
    '--paper-2': hsl(h + 25, 28, 89),
    '--ink': hsl(h, 35, 11),
    '--vivid': hsl(h, Math.max(s, 70), 46),
    '--vivid-2': hsl(h + 28, Math.max(s, 70), 50),
    '--vivid-3': hsl(h - 28, Math.max(s, 70), 44),
  };
}

// ---- markup -------------------------------------------------------------------------
/**
 * The app's own art on a slide (store/assets.json ids): slides[].art = { asset, place, size?,
 * side?, flip? }, or a list of them.
 *   beside    a sticker over the phone's lower corner, in front of it
 *   peek      half hidden behind the phone's edge, looking out
 *   backdrop  a scene filling the slide behind the phone (painted landscapes, textures)
 *   closer    on the closing slide, in place of the app icon
 *   float     a card or object centred on at: [x, y] (% of the slide), optionally rotated (deg):
 *             the app's own UI from outside the app (a widget, a Live Activity), a photo
 *             (radius, aspect: "4/5"), a prop, a cut-out. behind: true puts it behind the phones,
 *             front: true in front of the pieces
 * size is the width in % of the slide (closer: the height); side is left|right (default alternates).
 */
const ART_SIZE = { beside: 34, peek: 40, closer: 50, float: 80 };
export const artOf = slide => (Array.isArray(slide.art) ? slide.art : slide.art ? [slide.art] : []).map(a => (typeof a === 'string' ? { asset: a } : a));

function artMarkup(slide, i, layout) {
  return artOf(slide).filter(a => a.asset && (a.place ?? 'beside') !== 'backdrop' && (a.place ?? 'beside') !== 'closer' && layout !== 'closer').map(a => {
    const place = a.place ?? 'beside', side = a.side ?? (i % 2 ? 'left' : 'right');
    const [ax, ay] = a.at ?? [50, 55];
    const style = `--i: ${i}; --art-w: ${a.size ?? ART_SIZE[place] ?? 34}${a.flip ? '; scale: -1 1' : ''}${place === 'float' ? `; --at-x: ${ax}; --at-y: ${ay}${a.rotate ? `; rotate: ${a.rotate}deg` : ''}` : ''}`
      + (a.radius ? `; border-radius: calc(var(--u) * ${a.radius})` : '') + (a.aspect ? `; aspect-ratio: ${a.aspect}; object-fit: cover` : '');
    return `  <img class="art a-${place} on-${side} at-${layout}${a.behind ? ' behind' : a.front ? ' front' : ''}" data-asset="${a.asset}" style="${style}" alt="">`;
  }).join('\n');
}

/**
 * Pieces (cut-outs, any style): whole objects of a capture (a card, a row, a number; never
 * a slice of the screen) enlarged as cards of their own over or beside the phone. At most two
 * per slide. slides[].pieces = [{ box: [x, y, w, h] (capture px), shot? (default the slide's),
 * size? (width, % of the slide), at?: [x, y] (the card's centre, % of the slide), side?
 * (left|right), tilt? (lean outwards), rotate? (deg), rim? (a white rim), radius?, pad?
 * (capture px), fill? (behind the padding) }].
 * Without `size` a piece is as big as its text needs (`text`, measured by OCR in writeStyle):
 * its biggest line LIFT_KEY and its smallest LIFT_MIN % of the slide's width tall (capitals),
 * within 40–92 %. Without `at` the kit places it: a narrow piece straddles the phone's edge on
 * its source's side (two take one side each), a wide one (> 56 % of the slide) covers its
 * source; then all are kept off the caption, the edges and each other (kit.js placePieces).
 */
export const LIFT_KEY = 3.75, LIFT_MIN = 2.2;
export function liftSize(p) {
  const across = p.box[2] + 2 * (p.pad ?? 0), t = p.text;
  if (p.size != null) return p.size;
  if (!t) return 58;
  return Math.round(Math.min(92, Math.max(40, (LIFT_KEY * across) / t.key, (LIFT_MIN * across) / t.min)));
}
function pieceMarkup(slide, i) {
  return (slide.pieces ?? []).filter(p => p.box?.length === 4).map(p => {
    const [, , w] = p.box, pad = p.pad ?? 0, size = liftSize(p), [ax, ay] = p.at ?? [50, 50];
    const px = v => `calc(var(--slide-w) * ${((size / 100) * v / (w + 2 * pad)).toFixed(4)})`;
    const style = `--i: ${i}; --at-x: ${ax}; --at-y: ${ay}; --size: ${size}; --rot: ${p.rotate ?? 0}deg; padding: ${px(pad)}; border-radius: ${px(p.radius ?? 0)}${p.fill ? `; background: ${p.fill}` : ''}`;
    const over = p.at ? '' : ` data-over${p.shift ? ` data-shift="${p.shift}"` : ''}${p.side ? ` data-side="${p.side}"` : ''}${p.tilt && p.rotate == null ? ' data-tilt' : ''}`;
    const text = p.text ? ` data-key="${p.text.key}" data-min="${p.text.min}" data-words="${p.text.words}"` : '';
    return `  <div class="piece${p.rim ? ' rim' : ''}"${over}${text} style="${style}"><div class="zoom" data-shot="${p.shot ?? slide.shot}" data-crop="${p.box.join(' ')}" style="border-radius: ${px(Math.max(0, (p.radius ?? 0) - pad))}"></div></div>`;
  }).join('\n');
}

function backdropMarkup(slide, i, blur, layout) {
  return artOf(slide).filter(a => a.place === 'backdrop').map(a => {
    const div = cls => `  <div class="${cls}" data-asset="${a.asset}" style="left: calc(var(--slide-w) * ${i})${a.position ? `; background-position: ${a.position}` : ''}"></div>`;
    if (blur === 'soft' || blur === 'strong') return div(`art-backdrop blurred ${blur}`);
    if (blur === 'caption') return `${div('art-backdrop')}\n${div(`art-backdrop blurred caption${layout === 'hang' ? ' low' : ''}`)}`;
    return div('art-backdrop');
  }).join('\n');
}

function slideMarkup(slide, i, layout, colours, proof = '', fan = false, lk = {}) {
  const vars = colours ? ` style="--bg: ${colours.bg}; --fg: ${colours.fg}; --pill-bg: ${colours.pillBg}; --pill-fg: ${colours.pillFg}; --sub: ${colours.sub}"` : '';
  const capBottom = layout === 'hang' || slide.caption === 'bottom';
  // look.subtitles: false drops the line under the headline (the closer keeps it); look.proof.at:
  // "top" puts the laurel above the headline.
  const sub = lk.subtitles === false && layout !== 'closer' ? '' : `\n      <p data-text="${slide.id}.subtitle" data-role="sub"></p>`;
  const [above, below] = lk.proof?.at === 'top' && proof ? [`${proof.trim()}\n      `, ''] : ['', proof];
  const cls = `caption${capBottom ? ' bottom' : ''}${slide.caption === 'middle' ? ' middle' : ''}${slide.headline === 'huge' ? ' huge' : ''}`;
  if (layout === 'closer') {
    return `  <section class="slide c-closer${fan ? ' with-fan' : ''}${colours?.accent ? ' accent' : ''}" id="${slide.id}"${vars}>
    ${(() => { const a = artOf(slide).find(x => (x.place ?? 'closer') === 'closer' || x.place === 'beside'); return a ? `<img class="closer-icon closer-art" data-asset="${a.asset}" style="${a.size ? `--art-h: ${a.size}` : ''}${a.flip ? '; scale: -1 1' : ''}" alt="">` : '<img class="closer-icon" data-app-icon alt="">'; })()}
    <div class="caption center">
      <h1 data-text="${slide.id}.title" data-fit data-role="title" data-lines="2"></h1>
      <p data-text="${slide.id}.subtitle" data-role="sub"></p>${proof}
    </div>
  </section>`;
  }
  return `  <section class="slide c-${layout}${colours?.accent ? ' accent' : ''}" id="${slide.id}"${vars}>
    <div class="${cls}">
      ${above}<h1 data-text="${slide.id}.title" data-fit data-role="title" data-lines="${slide.headline === 'huge' ? 3 : 2}"></h1>${sub}${below}
    </div>
  </section>`;
}

/**
 * The closer's fan: three of the set's screens as phones spread under the closing line, the
 * first screen in front (slide.fan: false keeps the closer to the icon and the line).
 */
function fanMarkup(slides, i) {
  // Three phones read as a fan; more turn into a pile. The first screen goes in the middle.
  const all = [...new Set(slides.filter(s => s.shot).map(s => s.shot))];
  if (slides[i].fan === false || all.length < 3) return '';
  const shots = [all[1], all[0], all[2]];
  const mid = (shots.length - 1) / 2;
  return shots.map((shot, j) => `  <div class="device d-fan" style="--i: ${i}; --k: ${j - mid}; --n: ${shots.length}" data-shot="${shot}"></div>`).join('\n');
}

/** A zoom slide's focus: slides[].focus, else its pop's box. */
const focusOf = slide => slide.focus ?? (Array.isArray(slide.pop) ? slide.pop : slide.pop?.box);

function deviceMarkup(slide, i, layout, prev, screenHeight, withProof = false) {
  // free: no phone (the slide shows floating art, or the other half of a spread).
  if (layout === 'closer' || layout === 'spread-end' || layout === 'free') return '';
  // Spread: one phone across this slide and the next, tilted. Each slide draws it in its own
  // clipped half; the next slide's half sits a gutter further left, because the store shows
  // a gap between screenshots and the phone has to line up across it.
  if (layout === 'spread') {
    const phone = twin => `<div class="device d-spread${twin ? ' twin' : ''}" data-cross style="--i: ${i}" data-shot="${slide.shot}"></div>`;
    return `  <div class="spread-half" style="--i: ${i}">${phone(false)}</div>\n  <div class="spread-half" style="--i: ${i + 1}">${phone(true)}</div>`;
  }
  // Zoom: the phone about twice its size, cut by its slide, the focus (capture px) centred in
  // the room the caption leaves; the kit picks the caption's side and the scale (kit.js zoomDevices).
  if (layout === 'zoom') return `  <div class="device d-zoom" data-cross data-focus="${focusOf(slide).join(' ')}" style="--i: ${i}" data-shot="${slide.shot}">\n  </div>`;
  // A hanging phone hides the top of its screen: hang it only as far as keeps the pop at
  // about a third of the slide (phone ≈ 2.06 × its width, slide ≈ 2.17 × the slide width).
  let own = '';
  const focus = Array.isArray(slide.pop) ? slide.pop : slide.pop?.box;
  if (layout === 'hang' && focus && screenHeight) {
    const cy = (focus[1] + focus[3] / 2) / screenHeight, phone = 80 * 2.06, slideH = 217;
    const top = (0.34 * slideH - (0.02 + 0.96 * cy) * phone) / slideH * 100;
    own = `; --hang-top: ${Math.max(-22, Math.min(-8, top)).toFixed(1)}%`;
  }
  // Pieces (collage) take the place of the pop.
  const box = slide.pieces?.length ? null : Array.isArray(slide.pop) ? slide.pop : slide.pop?.box;
  const p = slide.pop ?? {};
  const radius = (p.radius != null ? ` data-radius="${p.radius}"` : '') + (p.behind ? ` data-leave="${p.behind}"` : '')
    + (p.cut ? ` data-cut="${p.cut}"` : '') + (p.pad != null ? ` data-pad="${p.pad}"` : '') + (p.fill ? ` data-fill="${p.fill}"` : '');
  const pop = box ? `\n    <div class="pop" data-crop="${box.join(' ')}"${radius}></div>` : '';
  return `  <div class="device d-${layout}${prev ? ` after-${prev}` : ''}${withProof ? ' with-proof' : ''}" style="--i: ${i}${own}" data-shot="${slide.shot}">${pop}\n  </div>`;
}

/**
 * The rhythm's layout, unless it would hide the slide's focus (its pop): a hanging phone
 * hides the top of the screen, the others hide the bottom.
 */
function focusFit(layout, slide, screenHeight) {
  const box = Array.isArray(slide.pop) ? slide.pop : slide.pop?.box;
  if (!box || !screenHeight) return layout;
  const cy = (box[1] + box[3] / 2) / screenHeight;
  if (layout === 'hang' && cy < 0.36) return 'offset';
  if ((layout === 'offset' || layout === 'hero') && cy > 0.66) return 'hang';
  return layout;
}

/**
 * A style's defaults, from the first line of its template:
 * <!-- storeshots {"background": "glow", "colours": "one", "rhythm": ["tilt", "lean", …]} -->
 */
export function styleDefaults(style) {
  const m = readFileSync(join(STYLES_DIR, style, 'design.html'), 'utf8').match(/<!--\s*storeshots\s+(\{.*?\})\s*-->/s);
  return m ? JSON.parse(m[1]) : {};
}

/**
 * The look of a set: screenshots.json "look" over the style's defaults.
 * { style, palette, colours: one|each, accent: slide id|true|false, background: flat|glow|gradient|{image|asset, position?, credit}, blur: soft|strong|caption, font, proof,
 *   frame: plain[/colour[/width]]|none|<bezel>|device (the device's own frame) }
 * app.accent / app.palette still work (older projects).
 */
export function lookOf(config, style) {
  const look = config.look ?? {};
  const world = style ?? look.style ?? look.world; // "world" is the older name of "style"
  const defaults = world && styles().includes(world) ? styleDefaults(world) : {};
  return {
    rhythm: RHYTHM, colours: 'each', background: 'flat', accent: false, ...defaults, ...look, world, style: world,
    brand: look.brand ?? config.app?.accent ?? config.brand?.accent,
    palette: look.palette ?? config.app?.palette,
  };
}

function fieldMarkup(c, i, slide, slides, background, designDir) {
  const at = `left: calc(var(--slide-w) * ${i})`, cls = `field${c.accent ? ' accent' : ''}`;
  if (background === 'glow') return `  <div class="${cls} glow-field" style="${at}; --bg: ${c.bg}"></div>`;
  if (background === 'gradient') return `  <div class="${cls} gradient" style="${at}; --bg: ${c.bg}"></div>`;
  return `  <div class="${cls}" style="${at}; background: ${c.bg}; --bg: ${c.bg}"></div>`;
}

/**
 * Glow background: every slide's own screen side by side in one layer, blurred together, so
 * neighbouring slides blend into each other with no seam. The ends overscan by 15 % of a
 * slide so the blur does not fade out at the first and last edges. A slide without a shot
 * (the closer) borrows the first screen.
 */
function glowStrip(slides) {
  const first = slides.find(s => s.shot)?.shot, n = slides.length;
  const imgs = slides.map((s, i) => {
    const shot = s.shot ?? first, left = i === 0 ? 0 : i + 0.15, width = (i === 0 ? 1.15 : 1) + (i === n - 1 ? 0.15 : 0);
    return shot ? `<img class="glow" data-shot="${shot}" style="left: calc(var(--slide-w) * ${left}); width: calc(var(--slide-w) * ${width})" alt="">` : '';
  }).join('');
  return `  <div class="glow-strip" style="width: calc(var(--slide-w) * ${n + 0.3})">${imgs}</div>`;
}

/** The design HTML for a set of slides in a style. */
export function buildDesign(style, { slides, accent, palette: given, locale = 'en', screenHeight, look = {}, designDir, appRoot }) {
  if (!styles().includes(style)) throw usage(`unknown style "${style}"`, { fix: `styles: ${styles().join(', ')}` });
  const defaults = styleDefaults(style);
  const lk = { rhythm: RHYTHM, colours: 'each', background: 'flat', accent: false, ...defaults, ...look };
  const rhythm = lk.rhythm ?? RHYTHM;
  const layouts = slides.map((s, i) => s.layout ?? focusFit(i === slides.length - 1 && slides.length >= 5 && s.closer !== false && !s.shot ? 'closer' : rhythm[i] ?? 'offset', s, screenHeight))
    .map((l, i) => (l === 'zoom' && !focusOf(slides[i])?.length ? 'hero' : l)); // a zoom needs a focus
  // A spread takes the next slide too (never the closer); that slide gets no phone of its own.
  layouts.forEach((l, i) => {
    if (l !== 'spread') return;
    if (i + 1 < slides.length && layouts[i + 1] !== 'closer') layouts[i + 1] = 'spread-end';
    else layouts[i] = 'hero';
  });
  // 3D is a spice: at most two per set and never two in a row; the slides' own layouts win
  // over the rhythm's.
  const THREE_D = ['tilt', 'lay'];
  let budget = 2 - slides.filter(s => THREE_D.includes(s.layout)).length;
  layouts.forEach((l, i) => {
    if (!THREE_D.includes(l) || slides[i].layout) return;
    if (budget <= 0 || THREE_D.includes(layouts[i - 1]) || THREE_D.includes(layouts[i + 1])) layouts[i] = layouts[i - 1] === 'offset' ? 'hang' : 'offset';
    else budget--;
  });
  const accentAt = lk.accent === true ? Math.floor((slides.length - 1) / 2) : typeof lk.accent === 'string' ? slides.findIndex(s => s.id === lk.accent) : -1;
  const brand = accent ?? lk.brand;
  const tokens = Object.entries(palette(brand)).map(([k, v]) => `${k}: ${v};`).join(' ');
  const colours = slideColours(slides, { accent: brand, palette: given ?? lk.palette, colours: lk.colours, accentAt });
  const withProof = proofSlides(lk.proof, slides);
  const template = readFileSync(join(STYLES_DIR, style, 'design.html'), 'utf8');
  const compositions = readFileSync(join(STYLES_DIR, 'compositions.css'), 'utf8');
  const background = typeof lk.background === 'object' ? 'image' : lk.background;
  let backdrop = '';
  const position = lk.background?.position ? ` style="background-position: ${lk.background.position}"` : '';
  // look.blur on a picture across the strip: blurred in place, or a blurred copy along the top.
  const blurred = ['soft', 'strong', 'caption'].includes(lk.blur) ? ` blurred ${lk.blur}` : '';
  if (background === 'image' && lk.background.asset) backdrop = `  <div class="backdrop${lk.blur === 'caption' ? '' : blurred}" data-asset="${lk.background.asset}"${position}></div>`
    + (lk.blur === 'caption' ? `\n  <div class="backdrop${blurred}" data-asset="${lk.background.asset}"${position}></div>` : '');
  else if (background === 'image' && lk.background.image) {
    // One picture behind the whole strip (a panorama), path relative to the store folder.
    const src = designDir ? relative(designDir, resolve(designDir, '..', lk.background.image)) : lk.background.image;
    backdrop = `  <div class="backdrop" style="background-image: url('${src.split(sep).join('/')}')"></div>`;
  }
  const font = fontCSS(lk.font, { designDir, appRoot }) + typeCSS(lk, designDir);
  // The style's (or the look's) frame on every phone; "device" keeps the device's own bezel.
  const framed = markup => (lk.frame && lk.frame !== 'device' ? markup.replace(/<div class="device /g, `<div data-frame="${lk.frame}" class="device `) : markup);
  const html = template.replace(/\{\{(\w+)\}\}/g, (_, k) => ({
    LOCALE: locale,
    TOKENS: `:root { ${tokens} --slides: ${slides.length}; }`,
    COMPOSITIONS: compositions,
    DEVICES: framed(slides.map((s, i) => [layouts[i] === 'closer' ? fanMarkup(slides, i) : deviceMarkup(s, i, layouts[i], layouts[i - 1], screenHeight, withProof.includes(s.id)), artMarkup(s, i, layouts[i]), pieceMarkup(s, i)].filter(Boolean).join('\n')).join('\n')),
    SLIDES: slides.map((s, i) => slideMarkup(s, i, layouts[i], colours[i], withProof.includes(s.id) ? `\n      ${proofMarkup(lk.proof, locale)}` : '', layouts[i] === 'closer' && !!fanMarkup(slides, i), lk)).join('\n'),
    FIELDS: (backdrop || (background === 'glow' ? glowStrip(slides.map((s, i) => (layouts[i] === 'spread-end' ? { ...s, shot: slides[i - 1].shot } : s))) + '\n' : '') + colours.map((c, i) => fieldMarkup(c, i, slides[i], slides, background, designDir)).join('\n'))
      + slides.map((s, i) => backdropMarkup(s, i, lk.blur, layouts[i])).filter(Boolean).map(m => `\n${m}`).join(''),
  })[k] ?? '');
  return font ? html.replace(/<\/head>/i, `${font}\n</head>`) : html;
}

/**
 * look.headline: "big" (capitals about 9.5 % of the slide wide, the size most strong sets use)
 * and look.emphasis: the *marked* words of a headline as "box" (the style's own), "colour" (just
 * a colour), "serif" (an italic serif word in a sans headline) or "size" (a bigger line), or
 * { style, colour }. The colour defaults to the brand colour darkened (white on dark fields
 * needs one given).
 */
export function typeCSS(lk, designDir) {
  const em = typeof lk.emphasis === 'string' ? { style: lk.emphasis } : lk.emphasis ?? {};
  const rules = [];
  if (lk.headline === 'big') rules.push('.slide .caption:not(.huge) h1 { font-size: calc(var(--u) * 13.4) !important; line-height: .98 !important; }');
  const plain = 'display: inline !important; background: none !important; padding: 0 !important; margin: 0 !important; border-radius: 0 !important; box-shadow: none !important; -webkit-text-stroke: 0 !important;';
  const colour = `color: ${em.colour ?? 'var(--em-colour, color-mix(in srgb, var(--bg) 72%, black))'} !important;`;
  // serif and size keep the headline's colour unless one is given (a style's box colours its
  // words for the box, which reads poorly without it).
  const own = em.colour ? colour : 'color: inherit !important;';
  if (em.style === 'colour') rules.push(`.slide h1 em { ${plain} ${colour} }`);
  if (em.style === 'size') rules.push(`.slide h1 em { ${plain} display: block !important; font-size: 1.3em; line-height: .95; ${own} }`);
  if (em.style === 'serif') {
    if (designDir) {
      mkdirSync(join(designDir, 'fonts'), { recursive: true });
      for (const f of ['Fraunces-Italic.ttf', 'OFL-Fraunces.txt']) copyFileSync(join(KIT_DIR, 'fonts', f), join(designDir, 'fonts', f));
    }
    rules.push('@font-face { font-family: "Fraunces Italic"; src: url(fonts/Fraunces-Italic.ttf); font-weight: 100 900; font-style: italic; }',
      `.slide h1 em { ${plain} font-family: "Fraunces Italic", Georgia, serif !important; font-style: italic !important; font-weight: 480 !important; letter-spacing: -.02em !important; ${own} }`);
  }
  if (em.style && !['box', 'colour', 'size', 'serif'].includes(em.style)) throw usage(`unknown look.emphasis "${em.style}"`, { fix: 'box, colour, serif or size' });
  return rules.length ? `\n<style data-look-type>\n${rules.join('\n')}\n</style>` : '';
}

/** Fonts a style needs: every url(fonts/X) in its template. */
export function copyStyleFonts(style, designDir) {
  const template = readFileSync(join(STYLES_DIR, style, 'design.html'), 'utf8');
  const fonts = new Set([...template.matchAll(/url\(fonts\/([\w.-]+)\)/g)].map(m => m[1]));
  mkdirSync(join(designDir, 'fonts'), { recursive: true });
  for (const f of fonts) {
    copyFileSync(join(KIT_DIR, 'fonts', f), join(designDir, 'fonts', f));
    const family = f.replace(/(-Italic)?\.ttf$/, '');
    const licence = join(KIT_DIR, 'fonts', `OFL-${family}.txt`);
    if (existsSync(licence)) copyFileSync(licence, join(designDir, 'fonts', `OFL-${family}.txt`));
  }
  return [...fonts];
}

/** `storeshots style [name]`: writes design/<name>.html for an existing project (name defaults to look.style). */
/** Each piece's text (pieces[].text), read off its capture by OCR when tesseract is installed. */
function measurePieces(store, slides, locale) {
  const device = store.devices[0];
  return slides.map(s => !s.pieces?.length || !device ? s : { ...s, pieces: s.pieces.map(p => {
    if (p.text || p.box?.length !== 4) return p;
    const file = store.shotFile(device, locale, p.shot ?? s.shot);
    if (!existsSync(file)) return p;
    try { return { ...p, text: textIn(file, p.box, locale) ?? undefined }; } catch { return p; }
  }) });
}

export function writeStyle(store, style, { out, locale } = {}) {
  const world = style ?? store.config.look?.style ?? store.config.look?.world;
  if (!world) throw usage('which style?', { fix: `storeshots style <${styles().join('|')}>, or set "look": {"style": …} in screenshots.json` });
  const lang = locale ?? store.locales[0];
  const slides = measurePieces(store, slidesOf(store.config), lang);
  if (!slides.length) throw usage('no slides or shots in screenshots.json', { fix: 'declare "shots" (or "slides") first' });
  const designDir = join(store.dir, 'design');
  const file = join(store.dir, out ?? `design/${world}.html`);
  copyStyleFonts(world, designDir);
  const look = lookOf(store.config, world);
  const screenHeight = store.devices.length ? store.device(store.devices[0]).height : undefined;
  writeFileSync(file, buildDesign(world, { slides, accent: look.brand, palette: look.palette, look, locale: lang, screenHeight, designDir, appRoot: resolve(store.dir, store.config.app?.root ?? '..') }));
  return { style: world, file, slides: slides.map(s => s.id), look: { colours: look.colours, background: look.background, accent: look.accent, font: look.font ?? 'style' } };
}
