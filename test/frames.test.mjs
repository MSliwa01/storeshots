import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { measureBezel, plainFrame } from '../src/frames.mjs';
import { png, tmp } from './helpers.mjs';

test('measureBezel finds the transparent screen opening and its corner radius', () => {
  const [W, H] = [200, 400], hole = { x: 20, y: 30, w: 160, h: 340, r: 24 };
  const inside = (x, y) => {
    if (x < hole.x || y < hole.y || x >= hole.x + hole.w || y >= hole.y + hole.h) return false;
    const cx = Math.min(Math.max(x, hole.x + hole.r), hole.x + hole.w - 1 - hole.r);
    const cy = Math.min(Math.max(y, hole.y + hole.r), hole.y + hole.h - 1 - hole.r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= hole.r ** 2;
  };
  const file = join(tmp(), 'bezel.png');
  writeFileSync(file, png(W, H, { alpha: true, paint: (x, y) => (inside(x, y) ? [0, 0, 0, 0] : [10, 10, 10, 255]) }));
  const m = measureBezel(file);
  assert.deepEqual({ ...m.screen, radius: undefined }, { x: 20, y: 30, width: 160, height: 340, radius: undefined });
  assert.ok(Math.abs(m.screen.radius - hole.r) <= 1, `radius ${m.screen.radius}`);
});

test('plainFrame draws an even border around the screen, and "none" just the screen', () => {
  const device = { width: 1320, height: 2868 };
  const plain = plainFrame(device, 'plain/ff5a36/50');
  assert.deepEqual(plain.screen, { x: 66, y: 66, width: 1320, height: 2868, radius: 198 });
  assert.equal(plain.width, 1320 + 132);
  assert.match(Buffer.from(plain.url.split(',')[1], 'base64').toString(), /fill="#ff5a36"/);
  const none = plainFrame(device, 'none');
  assert.deepEqual([none.width, none.height, none.screen.x], [1320, 2868, 0]);
});
