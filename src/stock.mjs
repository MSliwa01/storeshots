// Stock photos for scenes and backdrops, when the app has no art of its own for an idea:
// Unsplash, Pexels and Pixabay (API keys) and Openverse (CC0 / public domain, no key).
// `stock "<query>"` draws a numbered contact sheet of candidates from every provider with a
// key; `stock --get <n>` downloads one into store/design/stock/ and adds it to
// store/assets.json with its credit. Photos that look generated are marked "AI?".
//
// Keys: UNSPLASH_ACCESS_KEY, PEXELS_API_KEY, PIXABAY_API_KEY in the environment, or in
// ~/.storeshots/.env or store/.env. A variable may hold several keys separated by commas;
// a key that hits its rate limit is skipped for the rest of the run.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from './browser.mjs';
import { envError, usage } from './errors.mjs';

const KEYS = { unsplash: 'UNSPLASH_ACCESS_KEY', pexels: 'PEXELS_API_KEY', pixabay: 'PIXABAY_API_KEY' };
const ORDER = ['unsplash', 'pexels', 'pixabay', 'openverse'];
const LONG_SIDE = 8000; // a backdrop may span a whole strip (six slides of 1320 px); never more than the original
const AI_WORDS = /\b(ai[- ]?generated|generated|generative|ai art|ai image|midjourney|stable diffusion|dall-?e|neural|render(ed)?|3d|cgi|illustration|digital art|fantasy)\b/i;
export const looksGenerated = text => AI_WORDS.test(text ?? '');

function loadEnv(storeDir) {
  for (const file of [join(homedir(), '.storeshots', '.env'), storeDir && join(storeDir, '.env')].filter(Boolean)) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const resting = new Set();
const keysOf = provider => (process.env[KEYS[provider]] ?? '').split(',').map(k => k.trim()).filter(Boolean).filter(k => !resting.has(k));
export const providers = () => ORDER.filter(p => p === 'openverse' || keysOf(p).length);

async function get(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'storeshots (+https://github.com/MSliwa01/storeshots)', ...headers } });
  if (!res.ok) throw Object.assign(new Error(`${res.status} ${new URL(url).host}`), { status: res.status });
  return res;
}

/** Runs `call(key)` with the provider's keys in turn until one is not rate-limited. */
async function withKey(provider, call) {
  if (provider === 'openverse') return call(null);
  for (const key of keysOf(provider)) {
    try { return await call(key); } catch (e) { if (![401, 403, 429].includes(e.status)) throw e; resting.add(key); }
  }
  throw envError(`no working ${provider} key`, { fix: `set ${KEYS[provider]} (in ~/.storeshots/.env); several keys separated by commas rotate` });
}

const q = params => new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();

async function searchProvider(provider, query, { orientation, n }) {
  return withKey(provider, async key => {
    if (provider === 'unsplash') {
      const data = await (await get(`https://api.unsplash.com/search/photos?${q({ query, per_page: Math.min(n, 30), content_filter: 'high', orientation: orientation === 'square' ? 'squarish' : orientation })}`, { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' })).json();
      return data.results.map(p => ({ id: p.id, width: p.width, height: p.height, alt: p.alt_description || p.description || '', photographer: `${p.user.name} / Unsplash`, source: p.links.html, thumb: p.urls.small, license: 'Unsplash License',
        url: `${p.urls.raw}&fm=jpg&q=90&${p.width >= p.height ? 'w' : 'h'}=${Math.min(LONG_SIDE, Math.max(p.width, p.height))}`, ping: p.links.download_location }));
    }
    if (provider === 'pexels') {
      const data = await (await get(`https://api.pexels.com/v1/search?${q({ query, per_page: Math.min(n, 80), orientation })}`, { Authorization: key })).json();
      return data.photos.map(p => ({ id: String(p.id), width: p.width, height: p.height, alt: p.alt || '', photographer: `${p.photographer} / Pexels`, source: p.url, thumb: p.src.medium, license: 'Pexels License',
        url: `${p.src.original}?auto=compress&cs=tinysrgb&${p.width >= p.height ? 'w' : 'h'}=${Math.min(LONG_SIDE, Math.max(p.width, p.height))}` }));
    }
    if (provider === 'pixabay') {
      const data = await (await get(`https://pixabay.com/api/?${q({ key, q: query, image_type: 'photo', per_page: Math.max(3, Math.min(n, 200)), orientation: { landscape: 'horizontal', portrait: 'vertical' }[orientation], safesearch: 'true' })}`)).json();
      // Without full API access Pixabay serves 1280 px on the long side (fullHD 1920): report that size.
      return data.hits.map(p => {
        const cap = p.imageURL ? null : p.fullHDURL ? 1920 : 1280, k = cap && Math.max(p.imageWidth, p.imageHeight) > cap ? cap / Math.max(p.imageWidth, p.imageHeight) : 1;
        return { id: String(p.id), width: Math.round(p.imageWidth * k), height: Math.round(p.imageHeight * k), alt: p.tags ?? '', photographer: `${p.user} / Pixabay`, source: p.pageURL, thumb: p.webformatURL, license: 'Pixabay Content License', url: p.imageURL || p.fullHDURL || p.largeImageURL };
      });
    }
    const data = await (await get(`https://api.openverse.org/v1/images/?${q({ q: query, license: 'cc0,pdm', page_size: Math.min(n, 20), mature: 'false', aspect_ratio: { landscape: 'wide', portrait: 'tall', square: 'square' }[orientation] })}`)).json();
    return data.results.map(p => ({ id: p.id, width: p.width ?? 0, height: p.height ?? 0, alt: p.title ?? '', photographer: `${p.creator || 'unknown'} via Openverse (${String(p.license).toUpperCase()})`, source: p.foreign_landing_url ?? '', thumb: p.thumbnail, license: `${String(p.license).toUpperCase()} ${p.license_version ?? ''}`.trim(), url: p.url }));
  });
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * `storeshots stock "<query>"`: candidates from every provider with a key (or --provider),
 * numbered on output/stock/sheet.png; output/stock/sheet.json maps the numbers to photos.
 * `--get <n>`: download that photo into store/design/stock/ and register it as an asset.
 */
export async function stock(store, { query, provider, orientation, n = 12, get: pick, id, log = console.error }) {
  loadEnv(store.dir);
  const outDir = join(store.paths.out, 'stock'), sheetJson = join(outDir, 'sheet.json');
  if (pick != null) return download(store, sheetJson, pick, id, log);
  if (!query) throw usage('what to search for?', { fix: 'storeshots stock "<query>" [--provider unsplash] [--orientation portrait|landscape|square]' });
  const list = provider ? [provider] : providers();
  if (provider && !ORDER.includes(provider)) throw usage(`unknown provider "${provider}"`, { fix: `providers: ${ORDER.join(', ')}` });
  const found = [];
  for (const p of list) {
    try { found.push(...(await searchProvider(p, query, { orientation, n: Number(n) })).slice(0, Number(n)).map(x => ({ provider: p, ...x, ai: looksGenerated(x.alt) }))); }
    catch (e) { log(`! ${p}: ${e.message}`); }
  }
  found.forEach((x, i) => { x.n = i + 1; });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(sheetJson, JSON.stringify({ query, photos: found }, null, 2));
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 20px; width: 1680px; font: 500 14px system-ui, sans-serif; color: #333; background: #fff; }
    main { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; } figure { margin: 0; }
    img { width: 100%; height: 220px; object-fit: cover; border-radius: 8px; display: block; background: #eee; }
    b { color: #000; } i { color: #888; font-style: normal; } .ai { color: #d00; font-weight: 700; }
  </style><main>${found.map(x => `<figure><img src="${esc(x.thumb)}"><figcaption><b>${x.n}</b> ${x.provider} <i>${x.width}×${x.height}</i>${x.ai ? ' <span class="ai">AI?</span>' : ''}</figcaption></figure>`).join('')}</main>`;
  const sheet = join(outDir, 'sheet.png');
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1720, height: 600 } });
    writeFileSync(`${sheet}.html`, html);
    await page.goto(pathToFileURL(`${sheet}.html`).href, { waitUntil: 'networkidle', timeout: 60000 });
    await page.screenshot({ path: sheet, fullPage: true });
  } finally { await browser.close(); }
  log(`${found.length} photos for "${query}" from ${list.join(', ')} → ${sheet}`);
  return { query, providers: list, sheet, photos: found.map(({ n, provider, width, height, alt, ai }) => ({ n, provider, width, height, alt: alt.slice(0, 80), ai })), next: 'storeshots stock --get <n> [--id name]' };
}

async function download(store, sheetJson, pick, id, log) {
  if (!existsSync(sheetJson)) throw usage('no stock sheet yet', { fix: 'storeshots stock "<query>" first' });
  const { photos } = JSON.parse(readFileSync(sheetJson, 'utf8'));
  const photo = photos.find(p => String(p.n) === String(pick) || `${p.provider}:${p.id}` === pick);
  if (!photo) throw usage(`no photo ${pick} on the last sheet`, { fix: `pick 1–${photos.length}` });
  if (photo.ping) await withKey('unsplash', key => get(photo.ping, { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' })).catch(() => {}); // Unsplash: register the download
  const res = await get(photo.url);
  const type = res.headers.get('content-type') ?? '', ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
  const rel = `design/stock/${photo.provider}-${String(photo.id).replace(/[^\w-]/g, '')}.${ext}`;
  mkdirSync(join(store.dir, 'design', 'stock'), { recursive: true });
  writeFileSync(join(store.dir, rel), Buffer.from(await res.arrayBuffer()));
  // Register it in store/assets.json, with the credit the licence asks for.
  const assetsFile = join(store.dir, 'assets.json');
  const doc = existsSync(assetsFile) ? JSON.parse(readFileSync(assetsFile, 'utf8')) : { assets: [] };
  const assetId = id ?? `${photo.provider}-${photo.id}`;
  doc.assets = (doc.assets ?? []).filter(a => a.id !== assetId);
  doc.assets.push({ id: assetId, file: `store/${rel}`, role: 'backdrop', alt: photo.alt, credit: { photographer: photo.photographer, source: photo.source, license: photo.license } });
  writeFileSync(assetsFile, JSON.stringify(doc, null, 2) + '\n');
  log(`saved ${rel} as asset "${assetId}"`);
  return { asset: assetId, file: join(store.dir, rel), credit: photo.photographer, license: photo.license, next: `use it: slides[].art {"asset": "${assetId}", "place": "backdrop"} or "look": {"background": {"asset": "${assetId}"}}` };
}
