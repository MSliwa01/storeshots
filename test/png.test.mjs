import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodePng, pngInfo } from '../src/png.mjs';
import { png } from './helpers.mjs';

test('encode → info → decode round trip (RGB and RGBA)', () => {
  const rgb = png(3, 2, { paint: (x, y) => [x * 50, y * 100, 7, 255] });
  assert.deepEqual(pngInfo(rgb), { width: 3, height: 2, depth: 8, colorType: 2, interlace: 0, hasAlpha: false });
  const { rgba } = decodePng(rgb);
  assert.deepEqual([...rgba.subarray(4 * 4, 4 * 4 + 4)], [50, 100, 7, 255]); // x=1, y=1

  const withAlpha = png(2, 2, { alpha: true, colour: [1, 2, 3, 128] });
  assert.equal(pngInfo(withAlpha).hasAlpha, true);
  assert.equal(decodePng(withAlpha).rgba[3], 128);
});

test('rejects non-PNG input', () => {
  assert.throws(() => pngInfo(Buffer.from('not a png at all')), /not a PNG/);
});
