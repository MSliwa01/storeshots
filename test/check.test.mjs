import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { check, nearBlack } from '../src/check.mjs';
import { loadStore } from '../src/store.mjs';
import { fakeStore } from './helpers.mjs';

const run = dir => { const store = loadStore(dir); return check(store, { devices: store.devices, locales: store.locales, log: () => {} }); };
const title = (size, extra = {}) => ({ key: 'a.title', slide: 'slide1', role: 'title', startSize: size, fontSize: size, lines: 2, overflow: false, outsideSlide: false, ...extra });

test('a clean set passes and writes the manifest', () => {
  const r = run(fakeStore({ texts: [title(150), { ...title(70), key: 'a.sub', role: 'sub', lines: 1 }] }));
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.deepEqual(r.warnings, []);
  assert.ok(existsSync(r.manifest));
});

test('wrong size and alpha are errors', () => {
  const r = run(fakeStore({ width: 1290, height: 2796, alpha: true }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /expected 1320×2868/.test(e)));
  assert.ok(r.errors.some(e => /alpha/.test(e)));
});

test('readability: tiny text fails, shrunk or mixed headlines warn', () => {
  const r = run(fakeStore({ texts: [title(150), title(130, { startSize: 150, slide: 'slide2' }), { ...title(40), key: 'tiny', role: 'text' }] }));
  assert.ok(r.errors.some(e => /tiny.*too small/.test(e)));
  assert.ok(r.warnings.some(e => /shrank 150→130/.test(e)));
  assert.ok(r.warnings.some(e => /headline sizes differ/.test(e)));
});

test('more than ten screenshots is an error, fewer than three a warning', () => {
  assert.ok(run(fakeStore({ files: 11 })).errors.some(e => /at most 10/.test(e)));
  assert.ok(run(fakeStore({ files: 2 })).warnings.some(e => /search results show 3/.test(e)));
});

test('check: one phone size, no floating phones, one headline line count', async () => {
  const { check } = await import('../src/check.mjs');
  const { loadStore } = await import('../src/store.mjs');
  const { fakeStore } = await import('./helpers.mjs');
  const { readFileSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = fakeStore({ files: 3, texts: [
    { key: 'a.title', slide: 'slide1', role: 'title', fontSize: 140, startSize: 140, lines: 2 },
    { key: 'b.title', slide: 'slide2', role: 'title', fontSize: 140, startSize: 140, lines: 1 },
  ] });
  const report = join(dir, 'output/final/iphone-6.9/en/report.json');
  const r = JSON.parse(readFileSync(report, 'utf8'));
  r.devices = [
    { slide: 'slide1', layout: 'hero', width: 1056, top: 860, bottom: 3020, slideHeight: 2868 },
    { slide: 'slide2', layout: 'hang', width: 900, top: -400, bottom: 1700, slideHeight: 2868 },
    { slide: 'slide3', layout: 'offset', width: 1056, top: 900, bottom: 2600, slideHeight: 2868 },
    { slide: 'slide3', layout: 'tilt', width: 970, top: 900, bottom: 2600, slideHeight: 2868 },
  ];
  writeFileSync(report, JSON.stringify(r));
  const { warnings } = check(loadStore(dir), { devices: ['iphone-6.9'], locales: ['en'], log: () => {} });
  assert.ok(warnings.some(w => /phone sizes differ/.test(w)), warnings.join('\n'));
  assert.ok(warnings.some(w => /slide3: the phone floats/.test(w)));
  assert.ok(!warnings.some(w => /slide1: the phone floats/.test(w)));
  assert.ok(warnings.some(w => /headlines have 1 and 2 lines/.test(w)));
});

test('check: pop-outs stick out evenly or sit inside, never one-sided or flush', async () => {
  const { check } = await import('../src/check.mjs');
  const { loadStore } = await import('../src/store.mjs');
  const { fakeStore } = await import('./helpers.mjs');
  const { readFileSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = fakeStore({ files: 3 });
  const report = join(dir, 'output/final/iphone-6.9/en/report.json');
  const r = JSON.parse(readFileSync(report, 'utf8'));
  r.pops = [
    { slide: 'slide1', left: 53, right: 54, phone: 1056 },   // even
    { slide: 'slide2', left: 12, right: 60, phone: 1056 },   // one-sided
    { slide: 'slide3', left: 1, right: -2, phone: 1056 },    // flush
    { slide: 'slide3', left: -95, right: -271, phone: 1056 }, // inside
  ];
  writeFileSync(report, JSON.stringify(r));
  const { warnings } = check(loadStore(dir), { devices: ['iphone-6.9'], locales: ['en'], log: () => {} });
  const pops = warnings.filter(w => /pop-out/.test(w));
  assert.equal(pops.length, 2, pops.join('\n'));
  assert.ok(pops.some(w => /slide2: the pop-out sticks out unevenly/.test(w)));
  assert.ok(pops.some(w => /slide3: the pop-out is flush/.test(w)));
});

test('check: copy rules and contrast hints', () => {
  const r = run(fakeStore({ texts: [
    title(150, { text: 'The best app, free!!', contrast: 2.1, color: [180, 180, 180], ground: { colour: '#ffffff', busy: 0.01 } }),
    title(150, { key: 'b.title', slide: 'slide2', text: 'Unlock your plants and water them every single day' }),
    title(150, { key: 'c.title', slide: 'slide3', text: 'Also on Android', contrast: 2.5, ground: { colour: '#808080', busy: 0.3 } }),
  ] }));
  assert.ok(r.errors.some(e => /contrast 2.1:1.*text #b4b4b4 → #[0-9a-f]{6} would reach 4.5:1/.test(e)), r.errors.join('\n'));
  assert.ok(r.errors.some(e => /c.title.*busy \(σ 0.3\)/.test(e)));
  assert.ok(r.errors.some(e => /another platform/.test(e)));
  assert.ok(r.warnings.some(w => /unprovable claim \("best"\)/.test(w)), r.warnings.join('\n'));
  assert.ok(r.warnings.some(w => /a price or "free"/.test(w)));
  assert.ok(r.warnings.some(w => /more than one "!"/.test(w)));
  assert.ok(r.warnings.some(w => /"unlock" is filler/.test(w)));
  assert.ok(r.warnings.some(w => /headline has 9 words/.test(w)));
});

test('check: hidden letters fail unless the text is meant to sit behind', () => {
  const hidden = [{ c: 'R', share: 0.9, top: 0.9 }];
  const r = run(fakeStore({ texts: [title(150, { hidden, hiddenShare: 0.3 }), title(150, { key: 'b.title', slide: 'slide2', hidden, hiddenShare: 0.3, behind: true })] }));
  assert.ok(r.errors.some(e => /a.title.*letters hidden behind.*"R"/.test(e)), r.errors.join('\n'));
  assert.ok(!r.errors.some(e => /b.title/.test(e)));
});

test('nearBlack: black and dark grey grounds, not deep saturated colours', () => {
  assert.equal(nearBlack({ lightness: 4, saturation: 5 }), true);
  assert.equal(nearBlack({ lightness: 15, saturation: 10 }), true);
  assert.equal(nearBlack({ lightness: 16, saturation: 60 }), false); // navy
  assert.equal(nearBlack({ lightness: 92, saturation: 15 }), false);
});

test('check: the same screen twice in the first three slides warns, later on it does not', () => {
  const dir = fakeStore({ files: 3, texts: [title(150)] }), file = join(dir, 'screenshots.json');
  const config = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, JSON.stringify({ ...config, slides: [{ id: 'garden', shot: 'garden' }, { id: 'opener', shot: null }, { id: 'task', shot: 'garden' }, { id: 'closer', shot: 'garden' }] }));
  const { warnings } = run(dir);
  assert.equal(warnings.filter(w => /show the same screen/.test(w)).length, 1, warnings.join('\n'));
  assert.ok(warnings.some(w => /slides "garden" and "task" show the same screen \("garden"\)/.test(w)), warnings.join('\n'));
});
