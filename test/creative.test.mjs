import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { creative } from '../src/creative.mjs';
import { CliError } from '../src/errors.mjs';
import { event, loadEvent } from '../src/event.mjs';
import { hashedName } from '../src/media.mjs';
import { loadStore } from '../src/store.mjs';
import { png, tmp } from './helpers.mjs';

const pem = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const realFetch = globalThis.fetch;
let calls;
beforeEach(() => { process.env.ASC_KEY_ID = 'K'; process.env.ASC_ISSUER_ID = 'I'; process.env.ASC_PRIVATE_KEY = pem; delete process.env.ASC_CONFIG; });
afterEach(() => { globalThis.fetch = realFetch; for (const k of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY']) delete process.env[k]; });

/** A tiny App Store Connect: `routes` answer by "METHOD /path" (prefix), everything is logged. */
function fakeAsc(routes) {
  calls = [];
  let n = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), method = init.method ?? 'GET';
    if (u.startsWith('https://upload.example/')) { calls.push(`${method} upload`); return new Response('', { status: 200 }); }
    const path = u.replace('https://api.appstoreconnect.apple.com', ''), body = init.body ? JSON.parse(init.body) : null;
    calls.push(`${method} ${path.split('?')[0]}`);
    const json = data => new Response(JSON.stringify(data), { status: 200 });
    for (const [key, answer] of Object.entries(routes)) {
      const [m, p] = key.split(' ');
      if (m === method && path.startsWith(p)) return json(typeof answer === 'function' ? answer({ path, body, id: `id${++n}` }) : answer);
    }
    if (method === 'DELETE' || method === 'PATCH') return json({});
    return new Response(`unexpected ${method} ${path}`, { status: 500 });
  };
}
const reserve = ({ body, id }) => ({ data: { id, attributes: { ...body.data.attributes, uploadOperations: [{ method: 'PUT', url: 'https://upload.example/p', offset: 0, length: body.data.attributes.fileSize, requestHeaders: [] }] } } });

function creativeStore() {
  const dir = tmp();
  writeFileSync(join(dir, 'screenshots.json'), JSON.stringify({ app: { name: 'C', ascAppId: '1' }, locales: ['en', 'pl'], devices: { 'iphone-6.9': {}, header: {}, search: {} }, shots: {} }));
  const put = (canvas, locale, w, h, colour) => {
    const out = join(dir, 'output/final', canvas, locale);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, `01-${canvas}.png`), png(w, h, { colour }));
    return join(out, `01-${canvas}.png`);
  };
  const files = {
    headerEn: put('header', 'en', 3840, 1646, [30, 60, 90, 255]),
    headerPl: put('header', 'pl', 3840, 1646, [90, 60, 30, 255]),
    searchEn: put('search', 'en', 1920, 1280, [20, 120, 60, 255]),
  };
  return { store: loadStore(dir), files };
}

function creativeRoutes(files, { state = 'PREPARE_FOR_SUBMISSION' } = {}) {
  const search = hashedName(files.searchEn, 'search').name;
  return {
    'GET /v1/apps/1/appStoreVersions': { data: [{ id: 'v1', attributes: { versionString: '2.1', appStoreState: state } }] },
    'GET /v1/appAssetLibraries/1/images': { data: [{ id: 'img-search', attributes: { fileName: search, state: 'PREPARE_FOR_SUBMISSION' } }] },
    'GET /v1/appAssetLibraries/1/videos': { data: [] },
    'GET /v1/appStoreVersions/v1/appStoreVersionLocalizations': { data: ['en-US', 'pl', 'de-DE'].map(l => ({ id: `loc-${l}`, attributes: { locale: l } })) },
    // en-US shows an older header; the others have nothing yet.
    'GET /v1/appStoreVersionLocalizations/loc-en-US/placements': { data: [{ id: 'pl-old', attributes: { placementType: 'PRODUCT_PAGE_HEADER_ASSET', state: 'PARENT_PREPARE_FOR_SUBMISSION' }, relationships: { image: { data: { id: 'img-old' } } } }] },
    'GET /v1/appStoreVersionLocalizations/': { data: [] },
    'POST /v1/appAssetLibraryImages': reserve,
    'GET /v1/appAssetLibraryImages/': { data: { attributes: { state: 'PREPARE_FOR_SUBMISSION' } } },
    'POST /v1/appAssetLibraryPlacements': ({ id }) => ({ data: { id } }),
  };
}

test('creative plan: own render or the first locale\'s, library reuse by hash, no writes', async () => {
  const { store, files } = creativeStore();
  fakeAsc(creativeRoutes(files));
  const r = await creative(store, { devices: store.devices, locales: store.locales, log: () => {} });
  assert.ok(calls.every(c => c.startsWith('GET')), calls.join('\n'));
  const asset = name => r.assets.find(a => a.name.startsWith(name));
  assert.equal(r.assets.length, 3);
  assert.equal(asset('search').action, 'reuse');
  assert.equal(r.assets.filter(a => a.name.startsWith('header')).every(a => a.action === 'upload'), true);
  const at = (locale, placement) => r.placements.find(p => p.locale === locale && p.placement === placement);
  assert.deepEqual([at('en-US', 'PRODUCT_PAGE_HEADER_ASSET').action, at('en-US', 'PRODUCT_PAGE_HEADER_ASSET').source], ['replace', 'own']);
  assert.equal(at('pl', 'PRODUCT_PAGE_HEADER_ASSET').source, 'own');
  assert.equal(at('de-DE', 'PRODUCT_PAGE_HEADER_ASSET').source, 'fallback en');
  assert.equal(at('pl', 'APP_STORE_SEARCH_RESULTS_ASSET').source, 'fallback en');
  assert.match(r.next, /--confirm/);
});

test('creative --confirm: uploads what is new, replaces the old placement, places all six', async () => {
  const { store, files } = creativeStore();
  fakeAsc(creativeRoutes(files));
  const r = await creative(store, { devices: store.devices, locales: store.locales, confirm: true, log: () => {} });
  assert.equal(calls.filter(c => c === 'POST /v1/appAssetLibraryImages').length, 2, 'the two headers; search is reused');
  assert.equal(calls.filter(c => c === 'DELETE /v1/appAssetLibraryPlacements/pl-old').length, 1);
  assert.equal(calls.filter(c => c === 'POST /v1/appAssetLibraryPlacements').length, 6);
  assert.equal(r.placements.filter(p => p.done).length, 6);
});

test('creative on a version on sale: waits for approval instead of placing', async () => {
  const { store, files } = creativeStore();
  fakeAsc(creativeRoutes(files, { state: 'READY_FOR_SALE' }));
  const r = await creative(store, { devices: store.devices, locales: store.locales, version: '2.1', log: () => {} });
  assert.ok(r.placements.every(p => p.action === 'waiting for approval'));
  assert.match(r.next, /--submit/);
});

test('creative refuses a header in the wrong size before any request', async () => {
  const { store } = creativeStore();
  writeFileSync(join(store.paths.final, 'header', 'en', '01-header.png'), png(1920, 823));
  fakeAsc({});
  await assert.rejects(creative(store, { devices: store.devices, locales: store.locales, log: () => {} }), e => e instanceof CliError && /3840×1646/.test(e.message));
  assert.deepEqual(calls, []);
});

// In-App Events

function eventStore(json) {
  const dir = tmp();
  writeFileSync(join(dir, 'screenshots.json'), JSON.stringify({ app: { name: 'E', ascAppId: '1' }, locales: ['en'], devices: { 'iphone-6.9': {} }, shots: {} }));
  const base = join(dir, 'events', 'snow');
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, 'card.png'), png(1920, 1080));
  writeFileSync(join(base, 'details.png'), png(1080, 1920));
  writeFileSync(join(base, 'event.json'), JSON.stringify(json));
  return loadStore(dir);
}
const day = d => new Date(Date.now() + d * 86400000).toISOString();
const GOOD = {
  referenceName: 'First snow', badge: 'SPECIAL_EVENT', purpose: 'APPROPRIATE_FOR_ALL_USERS', priority: 'HIGH', primaryLocale: 'en-US',
  schedule: { territories: ['USA', 'POL'], publishStart: day(2), eventStart: day(5), eventEnd: day(12) },
  copy: { 'en-US': { name: 'First snow', short: 'Watch the first snow fall on your scene', long: 'Snow settles on the meadow, the fjord and Paris.' }, pl: { name: 'Pierwszy śnieg', short: 'Pierwszy śnieg w Twojej scenie', long: 'Śnieg osiada na łące, fiordzie i w Paryżu.' } },
  media: { card: 'card.png', details: 'details.png' },
};

test('event.json: every problem at once (limits, 31 days, 14 days early, media)', () => {
  const store = eventStore({ ...GOOD, copy: { 'en-US': { ...GOOD.copy['en-US'], name: 'A name that is far longer than thirty characters' } },
    schedule: { territories: 'all', publishStart: day(1), eventStart: day(20), eventEnd: day(60) }, media: { card: 'card.png' } });
  assert.throws(() => loadEvent(store, 'snow'), e => {
    const detail = e.detail;
    return /name is 48 characters, the limit is 30/.test(detail) && /at most 31/.test(detail) && /14 days/.test(detail) && /media.details is missing/.test(detail);
  });
});

test('event plan, then --confirm --submit: creates the event, both locales, card and details, one review submission', async () => {
  const store = eventStore(GOOD);
  let localizations = [];
  fakeAsc({
    'GET /v1/apps/1/appEvents': { data: [] },
    'POST /v1/appEvents': { data: { id: 'ev1' } },
    'GET /v1/appEvents/ev1/localizations': () => ({ data: localizations }),
    'POST /v1/appEventLocalizations': ({ body, id }) => { localizations.push({ id, attributes: body.data.attributes }); return { data: { id } }; },
    'POST /v1/appEventScreenshots': reserve,
    'GET /v1/appEventScreenshots/': { data: { attributes: { assetDeliveryState: { state: 'COMPLETE' } } } },
    'POST /v1/reviewSubmissions': { data: { id: 'rs1' } },
    'POST /v1/reviewSubmissionItems': { data: { id: 'item' } },
    'GET /v1/appEvents/ev1': { data: { attributes: { eventState: 'WAITING_FOR_REVIEW' } } },
  });
  const plan = await event(store, 'snow', { log: () => {} });
  assert.equal(plan.action, 'create');
  assert.equal(plan.media.length, 4);
  assert.ok(calls.every(c => c.startsWith('GET')));

  const r = await event(store, 'snow', { confirm: true, submit: true, log: () => {} });
  assert.equal(r.id, 'ev1');
  assert.equal(calls.filter(c => c === 'POST /v1/appEventLocalizations').length, 2);
  assert.equal(calls.filter(c => c === 'POST /v1/appEventScreenshots').length, 4);
  assert.equal(calls.filter(c => c === 'POST /v1/reviewSubmissionItems').length, 1);
  assert.equal(r.state, 'WAITING_FOR_REVIEW');
});

test('an approved event is not changed', async () => {
  const store = eventStore(GOOD);
  fakeAsc({ 'GET /v1/apps/1/appEvents': { data: [{ id: 'ev1', attributes: { referenceName: 'First snow', eventState: 'APPROVED' } }] } });
  await assert.rejects(event(store, 'snow', { confirm: true, log: () => {} }), e => e instanceof CliError && /new referenceName/.test(e.fix));
});

test('check: a header is held to Apple\'s creative asset rules, a screenshot only warned', async () => {
  const { check } = await import('../src/check.mjs');
  const dir = tmp();
  writeFileSync(join(dir, 'screenshots.json'), JSON.stringify({ app: { name: 'C' }, locales: ['en'], devices: { 'iphone-6.9': {}, header: {} }, shots: {} }));
  const text = { slide: 'hero', key: 'hero.title', role: 'title', text: 'Free at www.example.com ©', fontSize: 400, startSize: 400, lines: 1 };
  for (const [canvas, w, h] of [['header', 3840, 1646], ['iphone-6.9', 1320, 2868]]) {
    const out = join(dir, 'output/final', canvas, 'en');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, '01-hero.png'), png(w, h));
    writeFileSync(join(out, 'report.json'), JSON.stringify({ files: ['01-hero.png'], slides: [{ id: 'hero' }], texts: [text], problems: [] }));
  }
  const store = loadStore(dir);
  const header = check(store, { devices: ['header'], locales: ['en'], log: () => {} });
  assert.ok(header.errors.some(e => /price or "free"/.test(e)), header.errors.join('\n'));
  assert.ok(header.errors.some(e => /web address/.test(e)));
  assert.ok(header.errors.some(e => /"©" sign/.test(e)));
  assert.ok(!header.warnings.some(w => /search results show 3/.test(w)), 'one header per locale is the norm');
  const shots = check(store, { devices: ['iphone-6.9'], locales: ['en'], log: () => {} });
  assert.ok(!shots.errors.some(e => /web address|price/.test(e)));
  assert.ok(shots.warnings.some(w => /price or "free"/.test(w)));
});
