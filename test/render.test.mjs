import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { check } from '../src/check.mjs';
import { launchBrowser } from '../src/browser.mjs';
import { ocrLanguages } from '../src/ocr.mjs';
import { KIT_DIR } from '../src/paths.mjs';
import { render } from '../src/render.mjs';
import { loadStore } from '../src/store.mjs';
import { png, tmp } from './helpers.mjs';

// A design with one problem per slide, rendered for real: the pixel measurements in the
// report must find each of them.
const DESIGN = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: Instrument; src: url("${join(KIT_DIR, 'fonts/InstrumentSans.ttf')}"); }
  body { margin: 0; font-family: Instrument, sans-serif; }
  .strip { display: flex; }
  .slide { position: relative; width: var(--slide-w); height: var(--slide-h); background: #f4f1ea; flex: none; }
  h1 { position: absolute; left: 10%; top: 8%; margin: 0; font-size: calc(var(--u) * 11); color: #16181d; }
  .over { position: absolute; left: 30%; top: 0; width: 70%; height: 30%; background: #2a6; }
  .gradient { background: linear-gradient(90deg, #e8e4dc, #f0ece4); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
  .a, .b { position: absolute; left: 10%; margin: 0; font-size: calc(var(--u) * 6); }
  .a { top: 50%; } .b { top: calc(50% + var(--u) * 2); }
</style></head><body><div class="strip">
  <section class="slide" id="hidden"><h1 data-text="hidden" data-role="title">Rekrutacja</h1><div class="over"></div></section>
  <section class="slide" id="glyphs"><h1 data-text="glyphs" data-role="title">Żaba жук</h1></section>
  <section class="slide" id="gradient"><h1 class="gradient" data-text="gradient" data-role="title">Pale gradient</h1></section>
  <section class="slide" id="overlap"><p class="a" data-text="a">w domu i w pracy</p><p class="b" data-text="b">On Android 5-10 min</p></section>
</div></body></html>`;

test('render: hidden letters, missing glyphs, gradient contrast, overlaps and typesetting are measured', async () => {
  const dir = tmp();
  mkdirSync(join(dir, 'design'), { recursive: true });
  mkdirSync(join(dir, 'copy'), { recursive: true });
  writeFileSync(join(dir, 'design', 'test.html'), DESIGN);
  writeFileSync(join(dir, 'copy', 'pl.json'), JSON.stringify({ hidden: 'Rekrutacja', glyphs: 'Żaba жук', gradient: 'Pale gradient', a: 'w domu i w pracy', b: 'On Android 5-10 min' }));
  writeFileSync(join(dir, 'screenshots.json'), JSON.stringify({ app: { name: 'Test' }, locales: ['pl'], devices: { 'iphone-6.9': { design: 'design/test.html' } }, shots: {} }));
  const store = loadStore(dir);
  await render(store, { devices: ['iphone-6.9'], locales: ['pl'], log: () => {} });
  const report = JSON.parse(readFileSync(join(store.paths.final, 'iphone-6.9', 'pl', 'report.json'), 'utf8'));
  const text = key => report.texts.find(t => t.key === key);

  assert.ok(text('hidden').hiddenShare > 0.5, JSON.stringify(text('hidden').hiddenShare));
  assert.ok(text('hidden').hidden.some(h => h.c === 'u'));
  assert.equal(text('glyphs').hiddenShare, 0);
  assert.equal(text('gradient').hiddenShare, 0);
  assert.match(text('glyphs').missingGlyphs, /ж/);
  assert.doesNotMatch(text('glyphs').missingGlyphs, /Ż/);
  assert.equal(text('gradient').contrastFrom, 'pixels');
  assert.ok(text('gradient').contrast < 1.5, String(text('gradient').contrast));
  assert.equal(text('a').text, 'w\u00a0domu i\u00a0w\u00a0pracy');
  assert.match(text('b').text, /5–10\u00a0min/);

  const { errors, warnings } = check(store, { devices: ['iphone-6.9'], locales: ['pl'], log: () => {} });
  assert.ok(errors.some(e => /hidden "hidden": letters hidden behind/.test(e)), errors.join('\n'));
  assert.ok(errors.some(e => /glyphs".*has no "ж"/.test(e)));
  assert.ok(errors.some(e => /gradient".*contrast/.test(e)));
  assert.ok(errors.some(e => /"a" runs into "b"/.test(e)));
  assert.ok(!errors.some(e => /gradient.*hidden/.test(e)), errors.join('\n'));
  assert.ok(errors.some(e => /another platform \("Android"\)/.test(e)));
  assert.ok(warnings.some(w => /glyphs: an empty band/.test(w)), warnings.join('\n'));
});

// A pill (an accent with a background) on the second line of a tight headline: inline, it
// paints over the descenders of the line above; as its own box with room above, it does not.
const PILLS = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: Instrument; src: url("${join(KIT_DIR, 'fonts/InstrumentSans.ttf')}"); }
  body { margin: 0; font-family: Instrument, sans-serif; }
  .strip { display: flex; }
  .slide { position: relative; width: var(--slide-w); height: var(--slide-h); background: #3b5bdb; flex: none; }
  h1 { position: absolute; left: 8%; right: 8%; top: 8%; margin: 0; font-size: calc(var(--u) * 12); line-height: 1; color: #fff; }
  h1 em { font-style: normal; background: #fff; color: #3b5bdb; padding: 0 .16em; }
  #boxed h1 em { display: inline-block; line-height: 1.04; padding: .02em .16em .07em; margin-top: .12em; }
</style></head><body><div class="strip">
  <section class="slide" id="inline"><h1 data-text="inline" data-role="title"></h1></section>
  <section class="slide" id="boxed"><h1 data-text="boxed" data-role="title"></h1></section>
</div></body></html>`;

test('render: a pill covering the line above is an error, a boxed pill is not', async () => {
  const dir = tmp();
  mkdirSync(join(dir, 'design'), { recursive: true });
  mkdirSync(join(dir, 'copy'), { recursive: true });
  writeFileSync(join(dir, 'design', 'test.html'), PILLS);
  writeFileSync(join(dir, 'copy', 'en.json'), JSON.stringify({ inline: 'Every day\n*by you*', boxed: 'Every day\n*by you*' }));
  writeFileSync(join(dir, 'screenshots.json'), JSON.stringify({ app: { name: 'Test' }, locales: ['en'], devices: { 'iphone-6.9': { design: 'design/test.html' } }, shots: {} }));
  const store = loadStore(dir);
  await render(store, { devices: ['iphone-6.9'], locales: ['en'], log: () => {} });
  const { errors } = check(store, { devices: ['iphone-6.9'], locales: ['en'], log: () => {} });
  assert.ok(errors.some(e => /en inline: the accent's background covers "y"/.test(e)), errors.join('\n'));
  assert.ok(!errors.some(e => /boxed: the accent's background/.test(e)), errors.join('\n'));
});

// Two cut-outs from one capture: a calm card over a striped picture, cropped along its own
// edge (busy just outside, calm just inside), and a crop through the middle of the stripes.
const PIECES = `<!doctype html><html><head><meta charset="utf-8"><style>
  @import url("${join(KIT_DIR, 'styles/compositions.css')}");
  body { margin: 0; }
  .strip { display: flex; }
  .slide { position: relative; width: var(--slide-w); height: var(--slide-h); background: #eee; flex: none; }
</style></head><body><div class="strip">
  <section class="slide" id="card"></section>
  <section class="slide" id="stripes"></section>
  <div class="piece" style="--i: 0; --at-x: 50; --at-y: 50; --size: 60"><div class="zoom" data-shot="shot" data-crop="200 400 800 400"></div></div>
  <div class="piece" style="--i: 1; --at-x: 50; --at-y: 50; --size: 60"><div class="zoom" data-shot="shot" data-crop="200 1600 800 400"></div></div>
</div></body></html>`;

test('render: a cut-out through a picture is an error, a card cropped along its edge is not', async () => {
  const dir = tmp();
  mkdirSync(join(dir, 'design'), { recursive: true });
  writeFileSync(join(dir, 'design', 'test.html'), PIECES);
  writeFileSync(join(dir, 'screenshots.json'), JSON.stringify({ app: { name: 'Test' }, locales: ['en'], devices: { 'iphone-6.9': { design: 'design/test.html' } }, shots: { shot: {} } }));
  const store = loadStore(dir);
  mkdirSync(dirname(store.rawShot('iphone-6.9', 'en', 'shot')), { recursive: true });
  const card = (x, y) => x >= 200 && x < 1000 && y >= 400 && y < 800;
  writeFileSync(store.rawShot('iphone-6.9', 'en', 'shot'), png(1320, 2868, { paint: (x, y) => card(x, y) ? [250, 250, 250, 255] : (x + y) % 40 < 20 ? [30, 90, 160, 255] : [240, 200, 80, 255] }));
  await render(store, { devices: ['iphone-6.9'], locales: ['en'], log: () => {} });
  const { errors } = check(store, { devices: ['iphone-6.9'], locales: ['en'], log: () => {} });
  assert.ok(errors.some(e => /en stripes: the cut-out \[200, 1600, 800, 400\] cuts through/.test(e)), errors.join('\n'));
  assert.ok(!errors.some(e => /en card: the cut-out/.test(e)), errors.join('\n'));
});

// Art on four slides: a cut-out cut at the waist by its photo (opaque along its bottom edge)
// standing in the middle, the same cut-out sunk past the slide's bottom, a round sticker
// pushed past the right edge, and a figure whose arm the photo cut at the wrist (opaque along
// 5 % of its right edge).
const ART = `<!doctype html><html><head><meta charset="utf-8"><style>
  @import url("${join(KIT_DIR, 'styles/compositions.css')}");
  body { margin: 0; }
  .strip { display: flex; }
  .slide { position: relative; width: var(--slide-w); height: var(--slide-h); background: #eee; flex: none; }
</style></head><body><div class="strip">
  <section class="slide" id="inside"></section>
  <section class="slide" id="bleeds"></section>
  <section class="slide" id="sticker"></section>
  <section class="slide" id="reach"></section>
  <img class="art a-float" data-asset="person" style="--i: 0; --art-w: 20; --at-x: 50; --at-y: 50" alt="">
  <img class="art a-float" data-asset="person" style="--i: 1; --art-w: 20; --at-x: 50; --at-y: 90" alt="">
  <img class="art a-float" data-asset="ball" style="--i: 2; --art-w: 40; --at-x: 95; --at-y: 50" alt="">
  <img class="art a-float" data-asset="reach" style="--i: 3; --art-w: 20; --at-x: 50; --at-y: 50" alt="">
</div></body></html>`;

test('render: a cut-out\'s cropped edge has to run past the slide, other art must not', async () => {
  const dir = join(tmp(), 'store');
  mkdirSync(join(dir, 'design'), { recursive: true });
  writeFileSync(join(dir, 'design', 'test.html'), ART);
  writeFileSync(join(dir, 'design', 'person.png'), png(200, 400, { alpha: true, paint: (x, y) => (x >= 60 && x < 140 && y >= 40 ? [120, 80, 60, 255] : [0, 0, 0, 0]) }));
  writeFileSync(join(dir, 'design', 'ball.png'), png(200, 200, { alpha: true, paint: (x, y) => ((x - 100) ** 2 + (y - 100) ** 2 < 80 ** 2 ? [220, 60, 60, 255] : [0, 0, 0, 0]) }));
  writeFileSync(join(dir, 'design', 'reach.png'), png(200, 400, { alpha: true, paint: (x, y) => ((x >= 60 && x < 140 && y >= 40 && y < 360) || (x >= 140 && y >= 100 && y < 120) ? [120, 80, 60, 255] : [0, 0, 0, 0]) }));
  writeFileSync(join(dir, 'assets.json'), JSON.stringify({ assets: [{ id: 'person', file: 'store/design/person.png', role: 'cutout' }, { id: 'ball', file: 'store/design/ball.png', role: 'prop' }, { id: 'reach', file: 'store/design/reach.png', role: 'cutout' }] }));
  writeFileSync(join(dir, 'screenshots.json'), JSON.stringify({ app: { name: 'Test' }, locales: ['en'], devices: { 'iphone-6.9': { design: 'design/test.html' } }, shots: {} }));
  const store = loadStore(dir);
  await render(store, { devices: ['iphone-6.9'], locales: ['en'], log: () => {} });
  const { warnings } = check(store, { devices: ['iphone-6.9'], locales: ['en'], log: () => {} });
  assert.ok(warnings.some(w => /en inside: cut-out "person" shows the straight line .* \(bottom\)/.test(w)), warnings.join('\n'));
  assert.ok(!warnings.some(w => /en bleeds: (art|cut-out)/.test(w)), warnings.join('\n'));
  assert.ok(warnings.some(w => /en sticker: art "ball" is cut by the slide's edge/.test(w)), warnings.join('\n'));
  assert.ok(warnings.some(w => /en reach: cut-out "reach" shows the straight line .* \(right\)/.test(w)), warnings.join('\n'));
});

// Two cards on a grey screen, lifted as cut-outs: one cropped 12 px wide on its right (a strip
// of the grey screen comes along), one cropped along its own dark rim (the rim is the card's).
const SLIVERS = `<!doctype html><html><head><meta charset="utf-8"><style>
  @import url("${join(KIT_DIR, 'styles/compositions.css')}");
  body { margin: 0; }
  .strip { display: flex; }
  .slide { position: relative; width: var(--slide-w); height: var(--slide-h); background: #eee; flex: none; }
</style></head><body><div class="strip">
  <section class="slide" id="wide"></section>
  <section class="slide" id="rim"></section>
  <div class="piece" style="--i: 0; --at-x: 50; --at-y: 50; --size: 60"><div class="zoom" data-shot="shot" data-crop="200 400 812 400"></div></div>
  <div class="piece" style="--i: 1; --at-x: 50; --at-y: 50; --size: 60"><div class="zoom" data-shot="shot" data-crop="200 1600 800 400"></div></div>
</div></body></html>`;

test('render: a cut-out cropped wider than its card carries a strip of the screen; a card\'s own rim is no strip', async () => {
  const dir = tmp();
  mkdirSync(join(dir, 'design'), { recursive: true });
  writeFileSync(join(dir, 'design', 'test.html'), SLIVERS);
  writeFileSync(join(dir, 'screenshots.json'), JSON.stringify({ app: { name: 'Test' }, locales: ['en'], devices: { 'iphone-6.9': { design: 'design/test.html' } }, shots: { shot: {} } }));
  const store = loadStore(dir);
  mkdirSync(dirname(store.rawShot('iphone-6.9', 'en', 'shot')), { recursive: true });
  const inCard = (x, y, top) => x >= 200 && x < 1000 && y >= top && y < top + 400;
  const rim = (x, y) => inCard(x, y, 1600) && (x < 210 || x >= 990 || y < 1610 || y >= 1990);
  writeFileSync(store.rawShot('iphone-6.9', 'en', 'shot'), png(1320, 2868, { paint: (x, y) => (rim(x, y) ? [40, 40, 50, 255] : inCard(x, y, 400) || inCard(x, y, 1600) ? [250, 250, 250, 255] : [200, 200, 200, 255]) }));
  await render(store, { devices: ['iphone-6.9'], locales: ['en'], log: () => {} });
  const { warnings } = check(store, { devices: ['iphone-6.9'], locales: ['en'], log: () => {} });
  assert.ok(warnings.some(w => /en wide: the cut-out \[200, 400, 812, 400\] carries a 12 px strip of the screen beyond the card on its right/.test(w)), warnings.join('\n'));
  assert.ok(!warnings.some(w => /en rim: .*strip of the screen/.test(w)), warnings.join('\n'));
});

// A phone whose screen holds rows of long words: on one slide a blank card covers the right
// half of the rows; on another the phone hangs past the slide's left edge, cutting the words.
const WORDS = `<!doctype html><html><head><meta charset="utf-8"><style>
  @import url("${join(KIT_DIR, 'styles/compositions.css')}");
  body { margin: 0; background: #eee; }
  .strip { display: flex; }
  .slide { position: relative; width: var(--slide-w); height: var(--slide-h); flex: none; }
</style></head><body><div class="strip">
  <section class="slide" id="covered"></section>
  <section class="slide" id="spacer"></section>
  <section class="slide" id="cut"></section>
  <div class="device" data-shot="words" style="--i: 0; left: calc(var(--slide-w) * .1); top: 5%"></div>
  <div class="piece" style="--i: 0; --at-x: 70; --at-y: 45; --size: 40"><div class="zoom" data-shot="words" data-crop="900 2700 400 150"></div></div>
  <div class="device" data-shot="words" style="--i: 2; left: calc(var(--slide-w) * 2 - var(--u) * 25); top: 5%"></div>
</div></body></html>`;

test('render: a card half-covering words on the screen, and a slide\'s edge cutting them, are found', { skip: !ocrLanguages() && 'tesseract missing' }, async () => {
  const dir = tmp();
  mkdirSync(join(dir, 'design'), { recursive: true });
  writeFileSync(join(dir, 'design', 'test.html'), WORDS);
  writeFileSync(join(dir, 'screenshots.json'), JSON.stringify({ app: { name: 'Test' }, locales: ['en'], devices: { 'iphone-6.9': { design: 'design/test.html' } }, shots: { words: {} } }));
  const store = loadStore(dir);
  const file = store.rawShot('iphone-6.9', 'en', 'words');
  mkdirSync(dirname(file), { recursive: true });
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1320, height: 2868 } });
    const rows = ['Wonderfully', 'Breakfasting', 'Saturdays', 'Remembering', 'Gardening', 'Wonderland', 'Strawberries', 'Neighbours'];
    await page.setContent(`<body style="margin:0;background:#fff;font:700 130px sans-serif;color:#111">${rows.map((w, k) => `<div style="position:absolute;left:100px;top:${250 + k * 300}px">${w}</div>`).join('')}</body>`);
    await page.screenshot({ path: file });
  } finally { await browser.close(); }
  await render(store, { devices: ['iphone-6.9'], locales: ['en'], log: () => {} });
  const { warnings } = check(store, { devices: ['iphone-6.9'], locales: ['en'], log: () => {} });
  assert.ok(warnings.some(w => /en covered: the card covers part of "[A-Za-z]+" on the phone's screen/.test(w)), warnings.join('\n'));
  assert.ok(warnings.some(w => /en cut: "[A-Za-z]+" on the phone's screen is cut by the slide's edge/.test(w)), warnings.join('\n'));
  assert.ok(!warnings.some(w => /en covered: "[A-Za-z]+" on the phone's screen is cut/.test(w)), warnings.join('\n'));
});
