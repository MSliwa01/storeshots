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
function slideMarkup(slide, i, layout, colours, proof = '', fan = false) {
  const vars = colours ? ` style="--bg: ${colours.bg}; --fg: ${colours.fg}; --pill-bg: ${colours.pillBg}; --pill-fg: ${colours.pillFg}; --sub: ${colours.sub}"` : '';
  const capBottom = layout === 'hang';
  if (layout === 'closer') {
    return `  <section class="slide c-closer${fan ? ' with-fan' : ''}${colours?.accent ? ' accent' : ''}" id="${slide.id}"${vars}>
    <img class="closer-icon" data-app-icon alt="">
    <div class="caption center">
      <h1 data-text="${slide.id}.title" data-fit data-role="title" data-lines="2"></h1>
      <p data-text="${slide.id}.subtitle" data-role="sub"></p>${proof}
    </div>
  </section>`;
  }
  return `  <section class="slide c-${layout}${colours?.accent ? ' accent' : ''}" id="${slide.id}"${vars}>
    <div class="caption${capBottom ? ' bottom' : ''}">
      <h1 data-text="${slide.id}.title" data-fit data-role="title" data-lines="2"></h1>
      <p data-text="${slide.id}.subtitle" data-role="sub"></p>${proof}
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

function deviceMarkup(slide, i, layout, prev, screenHeight, withProof = false) {
  if (layout === 'closer') return '';
  // A hanging phone hides the top of its screen: hang it only as far as keeps the pop at
  // about a third of the slide (phone ≈ 2.06 × its width, slide ≈ 2.17 × the slide width).
  let own = '';
  const focus = Array.isArray(slide.pop) ? slide.pop : slide.pop?.box;
  if (layout === 'hang' && focus && screenHeight) {
    const cy = (focus[1] + focus[3] / 2) / screenHeight, phone = 80 * 2.06, slideH = 217;
    const top = (0.34 * slideH - (0.02 + 0.96 * cy) * phone) / slideH * 100;
    own = `; --hang-top: ${Math.max(-22, Math.min(-8, top)).toFixed(1)}%`;
  }
  const box = Array.isArray(slide.pop) ? slide.pop : slide.pop?.box;
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
 * { style, palette, colours: one|each, accent: slide id|true|false, background: flat|glow|gradient|{image, credit}, font, proof }
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
export function buildDesign(style, { slides, accent, palette: given, locale = 'en', screenHeight, look = {}, designDir }) {
  if (!styles().includes(style)) throw usage(`unknown style "${style}"`, { fix: `styles: ${styles().join(', ')}` });
  const defaults = styleDefaults(style);
  const lk = { rhythm: RHYTHM, colours: 'each', background: 'flat', accent: false, ...defaults, ...look };
  const rhythm = lk.rhythm ?? RHYTHM;
  const layouts = slides.map((s, i) => s.layout ?? focusFit(i === slides.length - 1 && slides.length >= 5 && s.closer !== false && !s.shot ? 'closer' : rhythm[i] ?? 'offset', s, screenHeight));
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
  if (background === 'image' && lk.background.image) {
    // One picture behind the whole strip (a panorama), path relative to the store folder.
    const src = designDir ? relative(designDir, resolve(designDir, '..', lk.background.image)) : lk.background.image;
    backdrop = `  <div class="backdrop" style="background-image: url('${src.split(sep).join('/')}')"></div>`;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => ({
    LOCALE: locale,
    TOKENS: `:root { ${tokens} --slides: ${slides.length}; }`,
    COMPOSITIONS: compositions,
    DEVICES: slides.map((s, i) => (layouts[i] === 'closer' ? fanMarkup(slides, i) : deviceMarkup(s, i, layouts[i], layouts[i - 1], screenHeight, withProof.includes(s.id)))).join('\n'),
    SLIDES: slides.map((s, i) => slideMarkup(s, i, layouts[i], colours[i], withProof.includes(s.id) ? `\n      ${proofMarkup(lk.proof, locale)}` : '', layouts[i] === 'closer' && !!fanMarkup(slides, i))).join('\n'),
    FIELDS: backdrop || (background === 'glow' ? glowStrip(slides) + '\n' : '') + colours.map((c, i) => fieldMarkup(c, i, slides[i], slides, background, designDir)).join('\n'),
  })[k] ?? '');
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
export function writeStyle(store, style, { out, locale } = {}) {
  const world = style ?? store.config.look?.style ?? store.config.look?.world;
  if (!world) throw usage('which style?', { fix: `storeshots style <${styles().join('|')}>, or set "look": {"style": …} in screenshots.json` });
  const slides = slidesOf(store.config);
  if (!slides.length) throw usage('no slides or shots in screenshots.json', { fix: 'declare "shots" (or "slides") first' });
  const designDir = join(store.dir, 'design');
  const file = join(store.dir, out ?? `design/${world}.html`);
  copyStyleFonts(world, designDir);
  const look = lookOf(store.config, world);
  const screenHeight = store.devices.length ? store.device(store.devices[0]).height : undefined;
  writeFileSync(file, buildDesign(world, { slides, accent: look.brand, palette: look.palette, look, locale: locale ?? store.locales[0], screenHeight, designDir }));
  return { style: world, file, slides: slides.map(s => s.id), look: { colours: look.colours, background: look.background, accent: look.accent } };
}
