// `storeshots catalog <axis>`: the project's own captures rendered in every option of one
// axis of the look, numbered on one sheet, so a choice is made by looking (and by number)
// instead of by imagining. `--pick <n>` writes the choice into screenshots.json.
//
// Axes:
//   style     every style, first slides of the set                   → look.style
//   layout    one slide (--slides id) in every phone layout           → slides[].layout
//   colours   one colour for the set vs a colour per slide            → look.colours
//   accent    no accent slide vs a contrasting middle slide           → look.accent
//   background (style-dependent) flat, gradient, glow                 → look.background
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { usage } from './errors.mjs';
import { render } from './render.mjs';
import { loadStore } from './store.mjs';
import { buildDesign, copyStyleFonts, lookOf, slidesOf, styles } from './styles.mjs';

const LAYOUTS = ['hero', 'lean', 'hang', 'offset', 'tilt', 'lay'];
export const AXES = ['style', 'layout', 'colours', 'accent', 'background', 'world']; // world: old name of style

function options(axis, store, look, slideId) {
  if (axis === 'style' || axis === 'world') return styles().map(w => ({ label: w, world: w, look: {} }));
  if (axis === 'layout') return LAYOUTS.map(l => ({ label: l, world: look.world, look: {}, layout: { [slideId]: l } }));
  if (axis === 'colours') return ['one', 'each'].map(c => ({ label: c === 'one' ? 'one colour' : 'colour per slide', world: look.world, look: { colours: c }, value: c }));
  if (axis === 'accent') return [false, true].map(a => ({ label: a ? 'accent slide' : 'no accent', world: look.world, look: { accent: a }, value: a }));
  if (axis === 'background') return ['flat', 'gradient', 'glow'].map(b => ({ label: b, world: look.world, look: { background: b }, value: b }));
  throw usage(`unknown axis "${axis}"`, { fix: `axes: ${AXES.join(', ')}` });
}

/** Numbered sheet: one row per option, the rendered slides side by side. */
async function sheet(file, rows) {
  const { launchBrowser } = await import('./browser.mjs');
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:28px;background:#1f2126;font:600 26px/1.2 system-ui,sans-serif;color:#fff;width:max-content}
      .row{display:flex;align-items:center;gap:16px;margin-bottom:22px}
      .n{width:150px;flex:none} .n b{display:block;font-size:64px;line-height:1} .n span{opacity:.75}
      img{height:520px;border-radius:18px;display:block}
      .across{display:flex;gap:26px} .across .row{flex-direction:column;align-items:flex-start;gap:10px} .across .n{width:auto;display:flex;gap:12px;align-items:baseline}
    </style>${rows.every(r => r.files.length <= 1) ? '<div class="across">' : '<div>'}${rows.map(r => `<div class="row"><div class="n"><b>${r.n}</b><span>${r.label}</span></div>${r.files.map(f => `<img src="${pathToFileURL(f)}">`).join('')}</div>`).join('')}</div>`;
    const htmlFile = `${file}.html`;
    writeFileSync(htmlFile, html);
    await page.goto(pathToFileURL(htmlFile).href);
    await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
    await page.setViewportSize({ width: 200, height: 200 });
    const size = await page.evaluate(() => ({ width: document.body.scrollWidth, height: document.body.scrollHeight }));
    await page.setViewportSize(size);
    await page.screenshot({ path: file, fullPage: true });
    rmSync(htmlFile, { force: true });
  } finally {
    await browser.close();
  }
  return file;
}

export async function catalog(store, { axis = 'style', slides: only, pick, count = 3, log = console.error } = {}) {
  const all = slidesOf(store.config);
  const look = lookOf(store.config);
  if (axis !== 'style' && axis !== 'world' && !look.world) throw usage('pick a style first', { fix: 'storeshots catalog style, then --pick <n>' });
  const slideId = axis === 'layout' ? only?.[0] : null;
  if (axis === 'layout' && !all.some(s => s.id === slideId && s.shot)) throw usage('which slide?', { fix: `storeshots catalog layout --slides <${all.filter(s => s.shot).map(s => s.id).join('|')}>` });
  const opts = options(axis, store, look, slideId);

  if (pick !== undefined) {
    const chosen = opts[Number(pick) - 1];
    if (!chosen) throw usage(`no option ${pick}`, { fix: `options: ${opts.map((o, i) => `${i + 1} ${o.label}`).join(', ')}` });
    const config = JSON.parse(readFileSync(join(store.dir, 'screenshots.json'), 'utf8'));
    config.look ??= {};
    if (axis === 'style' || axis === 'world') { config.look.style = chosen.world; delete config.look.world; }
    else if (axis === 'layout') {
      if (!Array.isArray(config.slides) || !config.slides.length) config.slides = all.map(({ id, shot }) => ({ id, shot }));
      config.slides.find(s => s.id === slideId).layout = chosen.layout[slideId];
    } else config.look[axis] = chosen.value;
    writeFileSync(join(store.dir, 'screenshots.json'), JSON.stringify(config, null, 2) + '\n');
    return { axis, picked: chosen.label, next: 'storeshots style (regenerates design/<style>.html), then storeshots build --design design/<style>.html' };
  }

  // Which slides to show: the layout axis shows its slide; the others the first few.
  const shown = axis === 'layout' ? [slideId] : (only ?? all.slice(0, count).map(s => s.id));
  const dir = join(store.dir, 'design', '.catalog');
  mkdirSync(dir, { recursive: true });
  const deviceId = store.devices[0], locale = store.locales[0];
  const screenHeight = store.device(deviceId).height;
  const rows = [];
  for (const [i, o] of opts.entries()) {
    const name = `${axis}-${String(o.label).replace(/\W+/g, '-')}`;
    const slides = all.map(s => (o.layout?.[s.id] ? { ...s, layout: o.layout[s.id] } : s));
    const lk = { ...lookOf(store.config, o.world), ...o.look };
    copyStyleFonts(o.world, dir);
    const file = join(dir, `${name}.html`);
    const html = buildDesign(o.world, { slides, accent: lk.brand, palette: lk.palette, look: lk, locale, screenHeight, designDir: dir });
    writeFileSync(file, html);
    const variant = loadStore(store.dir, { design: file });
    log(`catalog ${axis}: ${i + 1}/${opts.length} ${o.label}`);
    const [result] = await render(variant, { devices: [deviceId], locales: [locale], log: () => {} });
    const files = result.files.filter(f => shown.some(id => f.endsWith(`-${id}.png`))).map(f => join(result.dir, f));
    rows.push({ n: i + 1, label: o.label, files });
  }
  const out = join(store.paths.out, 'catalog');
  mkdirSync(out, { recursive: true });
  const file = await sheet(join(out, `${axis}${slideId ? `-${slideId}` : ''}.png`), rows);
  return {
    axis, sheet: file, slides: shown,
    options: rows.map(r => ({ n: r.n, label: r.label })),
    next: `look at the sheet, then storeshots catalog ${axis}${slideId ? ` --slides ${slideId}` : ''} --pick <n>`,
  };
}
