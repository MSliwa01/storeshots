// Reference library: screenshot sets of top App Store apps, for studying what works.
// Sources: Apple's top charts per category/country (iTunes RSS) and a curated list of
// sets known for great screenshots. Saves the first N screenshots of each app plus a
// one-row sheet per app into references/<country>/<slug>/ (gitignored: the images are
// the apps' own marketing, kept only for private study).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DATA_DIR } from './paths.mjs';

export const REFS_DIR = join(DATA_DIR, 'references');

/** App Store genre ids (iTunes). */
export const GENRES = {
  weather: 6001, utilities: 6002, travel: 6003, sports: 6004, social: 6005, reference: 6006,
  productivity: 6007, photo: 6008, news: 6009, navigation: 6010, music: 6011, lifestyle: 6012,
  health: 6013, games: 6014, finance: 6015, entertainment: 6016, education: 6017, books: 6018,
  medical: 6020, food: 6023, shopping: 6024,
};

/** Sets often cited for great screenshots (search terms; first result is taken). */
export const CURATED = [
  'Things 3', 'Structured Day Planner', 'Opal Screen Time', 'Flighty', 'Gentler Streak', 'Duolingo',
  'Headspace', 'Calm', 'Copilot Money', 'Bear Markdown Notes', 'Tiimo', 'Finch Self Care',
  'Revolut', 'Strava', 'Airbnb', 'Fantastical', 'Todoist', 'Halide Mark II', 'Lake Coloring',
  'Rise Sleep', 'LADDER Strength Training', 'Sweatcoin', 'Lifesum', 'Carrot Weather',
  'Mercury Weather', 'Apollo Neuro', 'Stoic Journal', 'Waterllama', 'Bezel Mirror', 'Daylio',
];

const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
const json = async (url, tries = 4) => {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise(r => setTimeout(r, 3000 * i)); // Apple rate-limits the iTunes API
    }
  }
};

/** Top apps of a chart: kind = topgrossingapplications | topfreeapplications | toppaidapplications. */
export async function topChart({ country = 'us', genre, kind = 'topgrossingapplications', limit = 25 }) {
  const g = genre ? `/genre=${GENRES[genre] ?? genre}` : '';
  const data = await json(`https://itunes.apple.com/${country}/rss/${kind}/limit=${limit}${g}/json`);
  return (data.feed.entry ?? []).map(e => ({ id: e.id.attributes['im:id'], name: e['im:name'].label }));
}

export async function lookup(ids, country = 'us') {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const data = await json(`https://itunes.apple.com/lookup?id=${ids.slice(i, i + 100).join(',')}&country=${country}&entity=software`);
    out.push(...data.results.filter(r => r.kind === 'software'));
  }
  return out;
}

export async function search(term, country = 'us') {
  const data = await json(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=software&country=${country}&limit=1`);
  return data.results[0];
}

/** Downloads up to `count` iPhone screenshots of one app and builds its sheet. */
export function saveApp(app, { country, tag, count = 6, width = 400 }) {
  const dir = join(REFS_DIR, country, slug(app.trackName));
  const sheet = join(dir, 'sheet.jpg');
  if (existsSync(sheet)) return { dir, sheet, cached: true };
  const urls = (app.screenshotUrls ?? []).slice(0, count);
  if (!urls.length) return null;
  mkdirSync(dir, { recursive: true });
  const files = [];
  urls.forEach((url, i) => {
    const file = join(dir, `${String(i + 1).padStart(2, '0')}.jpg`);
    // .../1290x2796bb.png → .../<width>x0w.jpg (Apple's image service resizes on the fly)
    const sized = url.replace(/\/[^/]+$/, `/${width}x0w.jpg`);
    execFileSync('curl', ['-sSfL', '-o', file, sized]);
    files.push(file);
  });
  const inputs = files.flatMap(f => ['-i', f]);
  const filter = files.map((_, i) => `[${i}]scale=${width}:-2,pad=${width}:ceil(ih/2)*2[s${i}]`).join(';')
    + ';' + files.map((_, i) => `[s${i}]`).join('') + `hstack=inputs=${files.length}`;
  if (files.length > 1) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', filter, '-q:v', '3', sheet]);
  else execFileSync('cp', [files[0], sheet]);
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({
    name: app.trackName, id: app.trackId, seller: app.sellerName, genre: app.primaryGenreName, country, tag,
    rating: app.averageUserRating, ratings: app.userRatingCount, url: app.trackViewUrl, screenshots: urls,
    landscape: /x\d+bb/.test(urls[0]) && (() => { const m = urls[0].match(/(\d+)x(\d+)bb/); return m && +m[1] > +m[2]; })(),
  }, null, 2));
  return { dir, sheet, cached: false };
}

/**
 * `storeshots board`: a labelled sheet (A, B, C…) of reference sets from the local library,
 * for the interview: the user points at letters instead of describing taste in words.
 * Picks by genre (most-rated first) or by explicit app folder names.
 */
export async function board({ countries = ['us'], genres, apps, limit = 8, out }) {
  const { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { pathToFileURL } = await import('node:url');
  const sets = [];
  for (const country of countries) {
    const dir = join(REFS_DIR, country);
    if (!existsSync(dir)) continue;
    for (const slug of readdirSync(dir)) {
      const meta = join(dir, slug, 'meta.json');
      if (!existsSync(meta)) continue;
      const m = JSON.parse(readFileSync(meta, 'utf8'));
      if (apps && !apps.includes(slug)) continue;
      if (!apps && genres && !genres.some(g => m.genre?.toLowerCase().includes(g.toLowerCase()))) continue;
      const shots = readdirSync(join(dir, slug)).filter(f => /^0[1-6]\.(jpg|png)$/.test(f)).sort().slice(0, 5).map(f => join(dir, slug, f));
      if (shots.length) sets.push({ slug, name: m.name, genre: m.genre, ratings: m.ratings ?? 0, curated: m.tag === 'curated', shots });
    }
  }
  if (apps) sets.sort((a, b) => apps.indexOf(a.slug) - apps.indexOf(b.slug)); else sets.sort((a, b) => (b.curated - a.curated) || b.ratings - a.ratings); // design-led sets first
  const chosen = sets.slice(0, limit).map((s, i) => ({ ...s, letter: String.fromCharCode(65 + i) }));
  if (!chosen.length) throw new Error(`no reference sets for ${genres?.join(', ') ?? apps?.join(', ')} in references/${countries.join(',')}; run \`storeshots refs\` first`);
  const file = out ?? join(REFS_DIR, '_boards', `${(genres ?? ['apps']).join('-').toLowerCase().replace(/\W+/g, '-')}.png`);
  mkdirSync(dirname(file), { recursive: true });
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:24px;background:#1f2126;font:600 22px/1.2 system-ui,sans-serif;color:#fff;width:max-content}
    .row{display:flex;align-items:center;gap:12px;margin-bottom:18px} .l{width:170px;flex:none}
    .l b{display:block;font-size:64px;line-height:1} .l span{opacity:.75;font-size:18px}
    img{height:440px;border-radius:14px;display:block}
  </style>${chosen.map(s => `<div class="row"><div class="l"><b>${s.letter}</b><span>${s.name.split(/[:–-]/)[0].trim()}</span></div>${s.shots.map(f => `<img src="${pathToFileURL(f)}">`).join('')}</div>`).join('')}`;
  const { launchBrowser } = await import('./browser.mjs');
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    writeFileSync(`${file}.html`, html);
    await page.goto(pathToFileURL(`${file}.html`).href);
    await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
    const size = await page.evaluate(() => ({ width: document.body.scrollWidth, height: document.body.scrollHeight }));
    await page.setViewportSize(size);
    await page.screenshot({ path: file, fullPage: true });
    rmSync(`${file}.html`, { force: true });
  } finally {
    await browser.close();
  }
  return { board: file, sets: chosen.map(({ letter, slug, name, genre }) => ({ letter, slug, name, genre })) };
}
