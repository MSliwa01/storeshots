import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { CliError, EXIT } from '../src/errors.mjs';
import { loadStore } from '../src/store.mjs';
import { ascCredentials, upload } from '../src/upload.mjs';
import { fakeStore, png, tmp } from './helpers.mjs';

const pem = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const realFetch = globalThis.fetch;
let calls;

/** Fake App Store Connect: one version in `state`, one localization, one set holding `remote` checksums. */
function fakeAsc({ state = 'PREPARE_FOR_SUBMISSION', remote = [] } = {}) {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url).replace('https://api.appstoreconnect.apple.com', '');
    calls.push(`${init.method ?? 'GET'} ${path.split('?')[0]}`);
    const json = body => new Response(JSON.stringify(body), { status: 200 });
    if (path.startsWith('/v1/apps/1/appStoreVersions')) return json({ data: [{ id: 'v1', attributes: { versionString: '2.0', appStoreState: state } }] });
    if (path.startsWith('/v1/appStoreVersions/v1/appStoreVersionLocalizations')) return json({ data: [{ id: 'loc', attributes: { locale: 'en-US' } }] });
    if (path.includes('/appScreenshotSets?')) return json({ data: [{ id: 'set' }] });
    if (path.startsWith('/v1/appScreenshotSets/set/appScreenshots')) return json({ data: remote.map((sum, i) => ({ id: `s${i}`, attributes: { sourceFileChecksum: sum } })) });
    return new Response('unexpected ' + path, { status: 500 });
  };
}

beforeEach(() => { process.env.ASC_KEY_ID = 'K'; process.env.ASC_ISSUER_ID = 'I'; process.env.ASC_PRIVATE_KEY = pem; delete process.env.ASC_CONFIG; });
afterEach(() => { globalThis.fetch = realFetch; for (const k of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY']) delete process.env[k]; });

function store() {
  const dir = fakeStore({ files: 3 });
  const s = loadStore(dir);
  s.app.ascAppId = '1';
  return s;
}

test('credentials come from the asc-compatible environment', () => {
  assert.equal(ascCredentials().keyId, 'K');
  assert.equal(ascCredentials({}), null);
});

test('plan without --confirm: replace, no writes', async () => {
  fakeAsc({ remote: ['x'] });
  const s = store();
  const r = await upload(s, { devices: s.devices, locales: ['en'], log: () => {} });
  assert.equal(r.applied, false);
  assert.equal(r.sets[0].action, 'replace');
  assert.equal(r.sets[0].existing, 1);
  assert.ok(calls.every(c => c.startsWith('GET')), calls.join('\n'));
});

test('a set whose checksums match is left alone', async () => {
  const s = store();
  const dir = join(s.paths.final, 'iphone-6.9', 'en');
  const sums = ['01-slide1.png', '02-slide2.png', '03-slide3.png'].map(f => createHash('md5').update(readFileSync(join(dir, f))).digest('hex'));
  fakeAsc({ remote: sums });
  const r = await upload(s, { devices: s.devices, locales: ['en'], confirm: true, log: () => {} });
  assert.equal(r.sets[0].action, 'unchanged');
  assert.ok(calls.every(c => c.startsWith('GET')));
});

test('a version in review is refused with exit 4 and a fix', async () => {
  fakeAsc({ state: 'WAITING_FOR_REVIEW' });
  const s = store();
  await assert.rejects(upload(s, { devices: s.devices, locales: ['en'], log: () => {} }), e => e instanceof CliError && e.exit === EXIT.UPLOAD && /editable/.test(e.fix));
});

/** A fuller fake: no set yet, so `confirm` creates one, uploads each file and orders them. */
function fakeAscWrites() {
  calls = [];
  let n = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), method = init.method ?? 'GET';
    if (u.startsWith('https://upload.example/')) { calls.push(`${method} upload`); return new Response('', { status: 200 }); }
    const path = u.replace('https://api.appstoreconnect.apple.com', '');
    calls.push(`${method} ${path.split('?')[0]}`);
    const json = body => new Response(JSON.stringify(body), { status: 200 });
    if (path.startsWith('/v1/apps/1/appStoreVersions')) return json({ data: [{ id: 'v1', attributes: { versionString: '2.0', appStoreState: 'PREPARE_FOR_SUBMISSION' } }] });
    if (path.startsWith('/v1/appStoreVersions/v1/appStoreVersionLocalizations')) return json({ data: [{ id: 'loc', attributes: { locale: 'en-US' } }] });
    if (path.includes('/appScreenshotSets?')) return json({ data: [] });
    if (method === 'POST' && path === '/v1/appScreenshotSets') return json({ data: { id: 'set', attributes: JSON.parse(init.body).data.attributes } });
    if (method === 'POST' && path === '/v1/appScreenshots') {
      const { fileName, fileSize } = JSON.parse(init.body).data.attributes;
      return json({ data: { id: `s${++n}`, attributes: { fileName, uploadOperations: [{ method: 'PUT', url: 'https://upload.example/p', offset: 0, length: fileSize, requestHeaders: [] }] } } });
    }
    if (method === 'PATCH') return json({ data: {} });
    if (method === 'GET' && /^\/v1\/appScreenshots\/s\d+$/.test(path)) return json({ data: { attributes: { assetDeliveryState: { state: 'COMPLETE' } } } });
    return new Response('unexpected ' + method + ' ' + path, { status: 500 });
  };
}

/** A project with both iPhone Duo displays rendered (outer first in screenshots.json). */
function duoStore({ outer = 2, inner = 2 } = {}) {
  const dir = tmp();
  writeFileSync(join(dir, 'screenshots.json'), JSON.stringify({ app: { name: 'Duo', ascAppId: '1' }, locales: ['en'], devices: { 'iphone-duo-outer': {}, 'iphone-duo-inner': {}, header: {} }, shots: {} }));
  for (const [id, count] of [['iphone-duo-outer', outer], ['iphone-duo-inner', inner]]) {
    const out = join(dir, 'output/final', id, 'en');
    mkdirSync(out, { recursive: true });
    for (let i = 1; i <= count; i++) writeFileSync(join(out, `0${i}-${id}-${i}.png`), png(8, 8, { colour: [i * 20, id.length * 9, 50, 255] }));
  }
  return loadStore(dir);
}

test('Duo outer and inner fill one APP_IPHONE_DUO set, outer first; header is left to `creative`', async () => {
  fakeAscWrites();
  const s = duoStore();
  const r = await upload(s, { devices: ['iphone-duo-inner', 'iphone-duo-outer', 'header'], locales: ['en'], confirm: true, log: () => {} });
  assert.equal(r.sets.length, 1);
  assert.equal(r.sets[0].displayType, 'APP_IPHONE_DUO');
  assert.equal(r.sets[0].device, 'iphone-duo-outer+iphone-duo-inner');
  assert.deepEqual(r.sets[0].files, ['01-iphone-duo-outer-1.png', '02-iphone-duo-outer-2.png', '01-iphone-duo-inner-1.png', '02-iphone-duo-inner-2.png']);
  assert.equal(r.sets[0].uploaded, 4);
  assert.equal(calls.filter(c => c === 'POST /v1/appScreenshotSets').length, 1);
  assert.equal(calls.filter(c => c === 'PUT upload').length, 4);
  assert.deepEqual(r.skipped.map(x => x.device), ['header']);
});

test('more than 10 Duo screenshots between both displays is refused before any request', async () => {
  fakeAscWrites();
  const s = duoStore({ outer: 6, inner: 5 });
  await assert.rejects(upload(s, { devices: ['iphone-duo-outer', 'iphone-duo-inner'], locales: ['en'], log: () => {} }), e => e instanceof CliError && /at most 10/.test(e.message));
  assert.deepEqual(calls, []);
});

test('an app preview that breaks the spec is refused before any request', async () => {
  fakeAscWrites();
  const dir = tmp();
  writeFileSync(join(dir, 'screenshots.json'), JSON.stringify({ app: { name: 'P', ascAppId: '1' }, locales: ['en'], devices: { 'iphone-6.9': {}, 'preview-iphone-6.9': {} }, shots: {} }));
  const out = join(dir, 'output/video/preview-iphone-6.9/en');
  mkdirSync(out, { recursive: true });
  // 2 s, 320×240, no audio: wrong on three counts.
  execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=30:d=2', '-pix_fmt', 'yuv420p', join(out, '01-demo.mp4')]);
  const s = loadStore(dir);
  await assert.rejects(upload(s, { devices: ['preview-iphone-6.9'], locales: ['en'], log: () => {} }),
    e => e instanceof CliError && /886×1920/.test(e.message) && /15–30 s/.test(e.message) && /audio/.test(e.message));
  assert.deepEqual(calls, []);
});
