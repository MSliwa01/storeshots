import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { iconColour } from '../src/brand.mjs';
import { png, tmp } from './helpers.mjs';

test('iconColour picks the dominant saturated colour, ignoring white and grey', () => {
  const file = join(tmp(), 'icon.png');
  writeFileSync(file, png(100, 100, { paint: (x, y) => (x < 60 ? [30, 140, 220, 255] : y < 50 ? [255, 255, 255, 255] : [120, 120, 120, 255]) }));
  const hex = iconColour(file);
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  assert.ok(Math.abs(r - 30) < 10 && Math.abs(g - 140) < 10 && Math.abs(b - 220) < 10, hex);
});
