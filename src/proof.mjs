// Social proof: the app's real App Store rating (fetched, never typed by hand) or a line
// the user supplies (downloads, a press quote, a non-Apple award), shown in a laurel that
// any slide can carry. Apple-designated recognitions (Editors' Choice, App of the Day,
// Apple Design Award) are left out: Apple asks not to repeat them in screenshots.
//
// screenshots.json "look": { "proof": { "rating": 4.8, "count": 2300, "slides": ["hero"] } }
//                       or { "proof": { "text": "100 tys.", "sub": "pobrań", "slides": [...] } }
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { usage } from './errors.mjs';

const RATINGS = { en: 'ratings', pl: 'ocen', de: 'Bewertungen', fr: 'notes', es: 'valoraciones', it: 'valutazioni', pt: 'avaliações', nl: 'beoordelingen', sv: 'betyg', ja: '件の評価', ko: '개 평가' };
const APPLE_AWARDS = /editor'?s'?\s*choice|app of the (day|year)|game of the (day|year)|apple design award|wybór redakcji|aplikacja dnia/i;
// Free text that reads as a ranking or an award the app may not have: Apple asks for no
// "recognition that your app or game hasn't actually received", Google Play for no "Best",
// "#1", "Top" or "Million Downloads" in screenshots (evals/research/claims.md).
const RANKING = /(#\s?1\b|\bno\.?\s?1\b|\bnumber one\b|\bbest\b|\btop\b|\baward|\bwinner|\bfeatured\b|\bnajlepsz\w*|\bnumer jeden\b|\bnr\s?1\b|\bnagrod\w*|\bnagrodzon\w*|\bzwycięzc\w*)/i;
const COUNTRY = { en: 'us', pl: 'pl', de: 'de', fr: 'fr', es: 'es', it: 'it', pt: 'br', nl: 'nl', sv: 'se', ja: 'jp', ko: 'kr' };

/**
 * One laurel branch (the left one; mirrored for the right): a stem on an arc from the bottom
 * up the left side, leaves alternating outside and inside it, each along the stem and
 * tipped outwards, smaller towards the top.
 */
function branch() {
  const cx = 52, cy = 50, r = 40, rad = d => (d * Math.PI) / 180;
  const at = (deg, rr = r) => [cx + rr * Math.cos(rad(deg)), cy + rr * Math.sin(rad(deg))];
  const leaves = [];
  for (let k = 0; k < 9; k++) {
    const deg = 112 + k * 16, out = k % 2 === 0 ? 1 : -1, size = 1 - k * 0.045;
    const [x, y] = at(deg, r + out * 4.2);
    // Tangent pointing up the stem (increasing angle), tipped 28° away from the stem.
    const tangent = (Math.atan2(Math.cos(rad(deg)), -Math.sin(rad(deg))) * 180) / Math.PI;
    const tilt = tangent + 90 + out * 28;
    leaves.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(4.1 * size).toFixed(2)}" ry="${(9.4 * size).toFixed(2)}" transform="rotate(${tilt.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
  }
  const [x0, y0] = at(104), [x1, y1] = at(250);
  return `<svg class="laurel" viewBox="0 0 56 100" aria-hidden="true"><path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><g fill="currentColor">${leaves.join('')}</g></svg>`;
}

const formatCount = (n, locale) => new Intl.NumberFormat(locale, { notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);

/** The laurel's HTML for a slide, or '' when there is nothing true to show. */
export function proofMarkup(proof, locale = 'en') {
  if (!proof) return '';
  const lang = locale.split(/[-_]/)[0];
  let big, small;
  if (proof.text) { big = proof.text; small = proof.sub ?? ''; }
  else if (proof.rating && proof.count) {
    big = `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(proof.rating)} <span class="stars">★★★★★</span>`;
    small = `${formatCount(proof.count, locale)} ${RATINGS[lang] ?? RATINGS.en}`;
  } else return '';
  if (APPLE_AWARDS.test(`${proof.text ?? ''} ${proof.sub ?? ''}`)) throw usage('Apple-designated awards do not belong in screenshots', { fix: 'use the rating, downloads, press or a non-Apple award' });
  const esc = s => String(s).replace(/&(?!\w+;)/g, '&amp;').replace(/<(?!\/?span)/g, '&lt;');
  return `<div class="proof">${branch()}<div class="proof-body"><b>${proof.text ? esc(big) : big}</b>${small ? `<small>${esc(small)}</small>` : ''}</div>${branch().replace('class="laurel"', 'class="laurel right"')}</div>`;
}

/**
 * What `check` says about a laurel's own line (look.proof.text and sub). A plain description
 * ("Calm & cosy") passes on iOS; a ranking or an award must be real and named.
 */
export function proofWarnings(proof) {
  if (!proof?.text) return [];
  const line = `${proof.text} ${proof.sub ?? ''}`.trim(), out = [];
  if (RANKING.test(line)) out.push(`look.proof: "${line}" reads as a ranking or an award; show only one the app really has, with its issuer and year (or the real rating: storeshots proof)`);
  out.push('look.proof: a laurel with your own line suits the App Store; Google Play asks for no accolades in screenshots, so leave it out of the Play set');
  return out;
}

/** Slides that carry the laurel: look.proof.slides, default the first. */
export const proofSlides = (proof, slides) => (proof && (proof.text || (proof.rating && proof.count)) ? (proof.slides ?? [slides[0]?.id]) : []);

/** `storeshots proof`: fetch the real rating into look.proof (keeps slides/text). */
export async function proof(store, { country, fetchImpl = fetch } = {}) {
  const app = store.config.app ?? {};
  const where = country ?? COUNTRY[store.locales[0]?.split(/[-_]/)[0]] ?? 'us';
  const query = app.ascAppId ? `id=${app.ascAppId}` : app.bundleId ? `bundleId=${encodeURIComponent(app.bundleId)}` : null;
  if (!query) throw usage('no app.ascAppId or app.bundleId in screenshots.json', { fix: 'add one of them to "app"' });
  const res = await fetchImpl(`https://itunes.apple.com/lookup?${query}&country=${where}`);
  const found = (await res.json()).results?.[0];
  const config = JSON.parse(readFileSync(join(store.dir, 'screenshots.json'), 'utf8'));
  config.look ??= {};
  const rating = found?.averageUserRating ?? null, count = found?.userRatingCount ?? 0;
  if (!found || !count) {
    return { country: where, rating: null, count: 0, found: !!found,
      fix: found ? 'no ratings yet in this country: try --country us, or give your own line: look.proof = {"text": "…", "sub": "…"} (downloads, press, a non-Apple award)' : 'the app is not live in this country',
    };
  }
  config.look.proof = { ...config.look.proof, rating: Math.round(rating * 10) / 10, count, source: `App Store ${where.toUpperCase()}`, fetched: new Date().toISOString().slice(0, 10) };
  writeFileSync(join(store.dir, 'screenshots.json'), JSON.stringify(config, null, 2) + '\n');
  const weak = rating < 4.5 || count < 100;
  return { country: where, rating: config.look.proof.rating, count, written: 'look.proof', ...(weak ? { advice: 'a rating under 4.5 or under 100 ratings rarely helps; consider a different proof or none' } : {}), next: 'storeshots style, then build' };
}
