import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, readlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { importShots } from '../src/import.mjs';
import { genericFrame } from '../src/frames.mjs';
import { pngInfo } from '../src/png.mjs';
import { readFileSync } from 'node:fs';
import { skill, SKILL_DIR } from '../src/skill.mjs';
import { loadStore } from '../src/store.mjs';
import { png, tmp } from './helpers.mjs';

function project(shots) {
  const dir = tmp();
  writeFileSync(join(dir, 'screenshots.json'), JSON.stringify({ app: { name: 'T' }, locales: ['en'], devices: { 'iphone-6.9': {} }, shots: Object.fromEntries(shots.map(s => [s, {}])) }));
  return loadStore(dir);
}

test('import: by name first, then in order; same ratio is scaled to the canvas', () => {
  const store = project(['hero', 'list', 'detail']);
  const src = tmp();
  writeFileSync(join(src, '01-list.png'), png(660, 1434));       // half size, same ratio
  writeFileSync(join(src, 'a.png'), png(1320, 2868));
  writeFileSync(join(src, 'b.png'), png(1320, 2868));
  const r = importShots(store, [src], { log: () => {} });
  assert.deepEqual(r.imported.map(i => [i.file.split('/').pop(), i.shot]), [['01-list.png', 'list'], ['a.png', 'hero'], ['b.png', 'detail']]);
  const info = pngInfo(readFileSync(store.rawShot('iphone-6.9', 'en', 'list')));
  assert.deepEqual([info.width, info.height, info.hasAlpha], [1320, 2868, false]);
});

test('import: another aspect ratio is refused with the expected size', () => {
  const store = project(['hero']);
  const src = tmp();
  writeFileSync(join(src, 'hero.png'), png(1290, 2000));
  assert.throws(() => importShots(store, [src], { log: () => {} }), /needs 1320×2868/);
});

test('generic frame: same geometry as the Apple bezel it stands in for', () => {
  const f = genericFrame({ width: 1320, height: 2868 });
  assert.deepEqual([f.width, f.height, f.screen.x, f.screen.y, f.screen.width, f.screen.height], [1470, 3000, 75, 66, 1320, 2868]);
  assert.match(Buffer.from(f.url.split(',')[1], 'base64').toString(), /^<svg [^>]*width="1470"/);
});

test('skill --install links the skill folder, and is idempotent', () => {
  const dir = join(tmp(), 'skills');
  const r = skill({ install: dir });
  assert.equal(readlinkSync(r.linked), SKILL_DIR);
  assert.ok(lstatSync(r.linked).isSymbolicLink());
  assert.equal(skill({ install: dir }).already, true);
  assert.ok(existsSync(join(r.linked, 'SKILL.md')));
});
