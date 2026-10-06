import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { keyOut } from '../src/art.mjs';
import { decodePng } from '../src/png.mjs';
import { png, tmp } from './helpers.mjs';

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

test('keyOut turns the magenta background transparent and keeps the subject', { skip: !hasFfmpeg && 'ffmpeg missing' }, () => {
  const dir = tmp(), input = join(dir, 'in.png'), output = join(dir, 'out.png');
  writeFileSync(input, png(64, 64, { paint: (x, y) => (x > 16 && x < 48 && y > 16 && y < 48 ? [40, 170, 70, 255] : [255, 0, 255, 255]) }));
  keyOut(input, output);
  const { width, rgba } = decodePng(readFileSync(output));
  const at = (x, y) => [...rgba.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)];
  assert.equal(at(2, 2)[3], 0, 'corner is transparent');
  const centre = at(32, 32);
  assert.equal(centre[3], 255, 'subject is opaque');
  assert.ok(Math.abs(centre[1] - 170) < 12 && centre[0] < 70, `subject colour kept: ${centre}`);
});
