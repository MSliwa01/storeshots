import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fakeStore, png, tmp } from './helpers.mjs';
import { loadStore } from '../src/store.mjs';

const BIN = fileURLToPath(new URL('../bin/storeshots.mjs', import.meta.url));
const cli = (args, cwd = tmp()) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, json: r.stdout.trim() ? JSON.parse(r.stdout) : null, stderr: r.stderr };
};

test('unknown command: exit 1, JSON error with a fix', () => {
  const r = cli(['nope']);
  assert.equal(r.code, 1);
  assert.equal(r.json.ok, false);
  assert.match(r.json.fix, /storeshots help/);
});

test('no project: exit 1 and points at init', () => {
  const r = cli(['check']);
  assert.equal(r.code, 1);
  assert.match(r.json.fix, /storeshots init/);
});

test('check on a broken set: exit 3, errors in the result, logs on stderr only', () => {
  const r = cli(['check', fakeStore({ alpha: true })]);
  assert.equal(r.code, 3);
  assert.ok(r.json.result.errors.some(e => /alpha/.test(e)));
  assert.match(r.stderr, /ERROR/);
});

test('check on a clean set: exit 0', () => {
  const r = cli(['check', fakeStore()]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json.ok, true);
});

test('import --device and --locale select a non-default output slot', () => {
  const project = tmp();
  writeFileSync(join(project, 'screenshots.json'), JSON.stringify({
    app: { name: 'Test' }, locales: ['en', 'pl'],
    devices: { 'iphone-6.9': {}, 'iphone-duo-outer': {} }, shots: { hero: {} },
  }));
  const source = join(tmp(), 'hero.png');
  writeFileSync(source, png(466, 678));
  const r = cli(['import', source, '--store', project, '--device', 'iphone-duo-outer', '--locale', 'pl']);
  assert.equal(r.code, 0, JSON.stringify(r.json));
  assert.equal(r.json.device, 'iphone-duo-outer');
  assert.equal(r.json.locale, 'pl');
  const store = loadStore(project);
  assert.ok(existsSync(store.rawShot('iphone-duo-outer', 'pl', 'hero')));
  assert.equal(existsSync(store.rawShot('iphone-6.9', 'en', 'hero')), false);
});

test('init --force keeps existing copy', async () => {
  const { writeFileSync, readFileSync } = await import('node:fs');
  const app = tmp();
  writeFileSync(`${app}/app.json`, JSON.stringify({ expo: { name: 'X', ios: { bundleIdentifier: 'com.x' } } }));
  assert.equal(cli(['init', app]).code, 0);
  writeFileSync(`${app}/store/copy/en.json`, '{"hero":{"title":"mine"}}');
  assert.equal(cli(['init', app, '--force']).code, 0);
  assert.match(readFileSync(`${app}/store/copy/en.json`, 'utf8'), /mine/);
});
