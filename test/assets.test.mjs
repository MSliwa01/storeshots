import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { imageSize, keyFlatBackground, scanAssets, webSafe } from '../src/assets.mjs';
import { png, tmp } from './helpers.mjs';

const write = (dir, path, data) => { mkdirSync(join(dir, path, '..'), { recursive: true }); writeFileSync(join(dir, path), data); };

test('assets: sizes from PNG and SVG headers', () => {
  const dir = tmp();
  write(dir, 'a.png', png(300, 200));
  write(dir, 'b.svg', '<svg width="212" viewBox="42 4 74 143"></svg>');
  assert.deepEqual({ ...imageSize(join(dir, 'a.png')), alpha: undefined }, { width: 300, height: 200, alpha: undefined });
  assert.deepEqual(imageSize(join(dir, 'b.svg')), { width: 74, height: 143, vector: true });
});

test('assets: art the code uses comes first, work files fold into groups, image sets count once', () => {
  const dir = tmp();
  write(dir, 'src/App.tsx', "const m = require('../assets/mascot/frog.png'); <Text style={{ fontFamily: 'Fredoka-Bold' }} />");
  write(dir, 'assets/mascot/frog.png', png(600, 600));
  write(dir, 'assets/mascot/tiny.png', png(40, 40));
  for (let i = 0; i < 20; i++) write(dir, `artifacts/qa/shot-${i}.png`, png(393, 852, { colour: [i, 0, 0, 255] }));
  write(dir, 'App/Assets.xcassets/Cat.imageset/cat@2x.png', png(400, 400));
  write(dir, 'App/Assets.xcassets/Cat.imageset/cat@3x.png', png(600, 600, { colour: [9, 9, 9, 255] }));
  write(dir, 'App/Assets.xcassets/Brand.colorset/Contents.json', JSON.stringify({ colors: [{ color: { components: { red: '0.2', green: '0.6', blue: '0.4' } } }] }));
  const found = scanAssets(dir);
  const files = found.art.filter(a => a.kind !== 'group').map(a => a.file);
  assert.deepEqual(files.sort(), ['App/Assets.xcassets/Cat.imageset/cat@3x.png', 'assets/mascot/frog.png']);
  const group = found.art.find(a => a.kind === 'group');
  assert.equal(group.shipped, false);
  assert.equal(group.count, 20);
  assert.equal(found.art.at(-1), group, 'work files go last');
  assert.deepEqual(found.colours.Brand, { any: '#339966' });
  assert.deepEqual(found.fonts.missing, ['Fredoka-Bold']);
});

test('assets: a flat artboard background is keyed out from the edges, the outline stops it', () => {
  const w = 20, h = 20, rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ring = Math.max(Math.abs(x - 10), Math.abs(y - 10)) === 5, inside = Math.max(Math.abs(x - 10), Math.abs(y - 10)) < 5;
    rgba.set(ring ? [0, 0, 0, 255] : inside ? [40, 40, 40, 255] : [40, 40, 40, 255], (y * w + x) * 4);
  }
  assert.equal(keyFlatBackground(w, h, rgba), true);
  assert.equal(rgba[(0 * w + 0) * 4 + 3], 0, 'outside is transparent');
  assert.equal(rgba[(10 * w + 10) * 4 + 3], 255, 'inside the outline stays, even in the same colour');
});

test('assets: SVGs without xmlns get a browser-safe copy', () => {
  const dir = tmp();
  write(dir, 'x.svg', '<?xml version="1.0"?><svg width="10" viewBox="0 0 10 10"><circle r="4"/></svg>');
  write(dir, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  assert.equal(webSafe(join(dir, 'ok.svg'), join(dir, 'cache')), join(dir, 'ok.svg'));
  assert.match(readFileSync(webSafe(join(dir, 'x.svg'), join(dir, 'cache')), 'utf8'), /<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
});

test('stock: tags that read as generated are flagged', async () => {
  const { looksGenerated } = await import('../src/stock.mjs');
  assert.equal(looksGenerated('AI generated city at night, digital art'), true);
  assert.equal(looksGenerated('Multiple colorful wheelie bins lined up along a brick wall'), false);
});
