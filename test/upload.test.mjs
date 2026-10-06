import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { CliError, EXIT } from '../src/errors.mjs';
import { loadStore } from '../src/store.mjs';
import { ascCredentials, upload } from '../src/upload.mjs';
import { fakeStore } from './helpers.mjs';

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
