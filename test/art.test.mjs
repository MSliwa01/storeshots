import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { art, artPrompt, codexError, croppedSides, imageProvider, keyOf, keyOut } from '../src/art.mjs';
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

test('artPrompt: a pose keeps the character and asks for a clear silhouette; a prop borrows only the style', () => {
  const pose = artPrompt({ id: 'wave', kind: 'pose', prompt: 'waving, one hoof raised', refs: ['sheep.svg'], transparent: true });
  assert.match(pose, /^Asset: a new pose of an app's own character/);
  assert.match(pose, /Input images: Image 1 shows the character\. It is the only source/);
  assert.match(pose, /Request: the same character as in Image 1, waving, one hoof raised\./);
  assert.match(pose, /Change only the pose and expression/);
  assert.match(pose, /stand clear of the body outline/);
  assert.match(pose, /pure magenta \(#FF00FF\)/);
  const prop = artPrompt({ id: 'can', kind: 'prop', prompt: 'a watering can', refs: ['a.svg', 'b.svg'] });
  assert.match(prop, /Images 1–2 are the app's own art, a reference for style only/);
  assert.match(prop, /No gloss, highlights, gradients or outlines that Images 1–2 don't have/);
  assert.doesNotMatch(prop, /magenta/);
  const scene = artPrompt({ id: 'hills', prompt: 'rolling hills at dawn', size: '1024x1536' });
  assert.match(scene, /Canvas: portrait, 1024:1536/);
  assert.match(scene, /calm, low-detail areas in the top third/);
});

test('art: with refs the kind must be given; --dry-run prints prompts and calls nothing', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'art.json'), JSON.stringify({ assets: [{ id: 'x', prompt: 'p', refs: ['a.png'] }] }));
  await assert.rejects(art({ dir }, { dryRun: true, log: () => {} }), /needs "kind"/);
  writeFileSync(join(dir, 'art.json'), JSON.stringify({ assets: [{ id: 'x', kind: 'pose', prompt: 'jumping', refs: ['a.png'], transparent: true }] }));
  const lines = [];
  const { prompts, files } = await art({ dir }, { dryRun: true, log: l => lines.push(l) });
  assert.equal(files.length, 0);
  assert.match(prompts.x, /jumping/);
  assert.match(lines[0], /── x \(pose, refs: a\.png\)/);
});

test('imageProvider: art.json or IMAGE_PROVIDER first, then an API key, then a Codex login', () => {
  assert.equal(imageProvider({ provider: 'codex' }, {}, () => null), 'codex');
  assert.equal(imageProvider({}, { IMAGE_PROVIDER: 'api' }, () => 'ok'), 'api');
  assert.equal(imageProvider({}, { IMAGE_API_KEY: 'k' }, () => 'ok'), 'api');
  assert.equal(imageProvider({}, {}, () => 'Logged in using ChatGPT'), 'codex');
  assert.throws(() => imageProvider({}, {}, () => null), /no image provider/);
  assert.throws(() => imageProvider({ provider: 'dalle' }, {}, () => null), /unknown image provider/);
});

test('croppedSides: a sticker touching the edge is reported', () => {
  const dir = tmp(), inside = join(dir, 'in.png'), cut = join(dir, 'cut.png');
  writeFileSync(inside, png(64, 64, { alpha: true, paint: (x, y) => (x > 8 && x < 56 && y > 8 && y < 56 ? [200, 100, 50, 255] : [0, 0, 0, 0]) }));
  writeFileSync(cut, png(64, 64, { alpha: true, paint: (x, y) => (x > 8 && x < 56 && y > 20 ? [200, 100, 50, 255] : [0, 0, 0, 0]) }));
  assert.deepEqual(croppedSides(inside), []);
  assert.deepEqual(croppedSides(cut), ['bottom']);
});

test('keyOf: a pink or purple subject is generated on green, everything else on magenta', () => {
  assert.equal(keyOf({ prompt: 'a gold trophy' }), 'magenta');
  assert.equal(keyOf({ prompt: 'a brain', style: 'glossy 3D in purple and pink' }), 'green');
  assert.equal(keyOf({ prompt: 'a pink flower', key: 'magenta' }), 'magenta');
  assert.match(artPrompt({ id: 'b', prompt: 'a lilac cloud', transparent: true }), /pure green \(#00FF00\)/);
});

test('keyOut with green turns the green background transparent', { skip: !hasFfmpeg && 'ffmpeg missing' }, () => {
  const dir = tmp(), input = join(dir, 'in.png'), output = join(dir, 'out.png');
  writeFileSync(input, png(64, 64, { paint: (x, y) => (x > 16 && x < 48 && y > 16 && y < 48 ? [150, 60, 200, 255] : [0, 255, 0, 255]) }));
  keyOut(input, output, 'green');
  const { width, rgba } = decodePng(readFileSync(output));
  const at = (x, y) => [...rgba.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)];
  assert.equal(at(2, 2)[3], 0);
  assert.equal(at(32, 32)[3], 255);
  assert.ok(Math.abs(at(32, 32)[2] - 200) < 12, `purple kept: ${at(32, 32)}`);
});

test('codexError: the usage-limit message from Codex\'s JSON events', () => {
  const out = ['{"type":"thread.started","thread_id":"t"}', '{"type":"error","message":"You\'ve hit your usage limit. Try again at 5:21 AM."}', '{"type":"turn.failed","error":{"message":"You\'ve hit your usage limit. Try again at 5:21 AM."}}'].join('\n');
  assert.match(codexError(out), /usage limit.*5:21 AM/);
  assert.equal(codexError('{"type":"turn.started"}'), null);
});

test('cutout: the subject cut out, cropped and added to assets.json with the photo\'s credit', async () => {
  const { cutout } = await import('../src/cutout.mjs');
  const { existsSync, mkdirSync } = await import('node:fs');
  const dir = tmp();
  mkdirSync(join(dir, 'design', 'stock'), { recursive: true });
  writeFileSync(join(dir, 'design', 'stock', 'p.jpg'), 'photo');
  writeFileSync(join(dir, 'assets.json'), JSON.stringify({ assets: [{ id: 'photo', file: 'store/design/stock/p.jpg', role: 'backdrop', alt: 'a hand', credit: { photographer: 'A / Unsplash' } }] }));
  const calls = [];
  // ffmpeg and rembg stand-ins: rembg leaves a 4×4 subject in a 20×20 transparent image, and a
  // faint veil along one row that the trim clears.
  const run = (cmd, args) => {
    calls.push([cmd, args]);
    const out = args[args.length - 1];
    writeFileSync(out, cmd === 'ffmpeg' ? png(20, 20) : png(20, 20, { alpha: true, paint: (x, y) => (x >= 8 && x < 12 && y >= 8 && y < 12 ? [200, 0, 0, 255] : y === 18 ? [0, 0, 0, 20] : [0, 0, 0, 0]) }));
  };
  const r = cutout({ dir, config: {} }, { source: 'photo', id: 'hand', crop: '10,20,300,400', run, log: () => {} });
  assert.ok(existsSync(r.file));
  assert.match(calls[0][1].join(' '), /crop=300:400:10:20/);
  assert.deepEqual(calls[1][1].slice(0, 3), ['i', '-m', 'isnet-general-use']);
  const cut = decodePng(readFileSync(r.file));
  assert.deepEqual([cut.width, cut.height], [4, 4]);
  const added = JSON.parse(readFileSync(join(dir, 'assets.json'), 'utf8')).assets.find(a => a.id === 'hand');
  assert.deepEqual([added.file, added.role, added.from, added.credit.photographer], ['store/design/cutouts/hand.png', 'cutout', 'photo', 'A / Unsplash']);
  assert.throws(() => cutout({ dir, config: {} }, { source: 'nope', run }), /no photo/);
  assert.throws(() => cutout({ dir, config: {} }, { source: 'photo', crop: '1,2', run }), /--crop/);
  const missing = () => { const e = new Error('spawn rembg ENOENT'); e.code = 'ENOENT'; throw e; };
  assert.throws(() => cutout({ dir, config: {} }, { source: 'photo', run: (cmd, args) => (cmd === 'ffmpeg' ? run(cmd, args) : missing()) }), /rembg is not installed/);
});
