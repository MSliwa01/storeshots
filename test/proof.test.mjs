import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proof, proofMarkup, proofSlides, proofWarnings } from '../src/proof.mjs';
import { buildDesign } from '../src/styles.mjs';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('proof: rating in the locale, nothing without a real number', () => {
  const html = proofMarkup({ rating: 4.8, count: 23400 }, 'pl');
  assert.match(html, /4,8/);
  assert.match(html, /23,4\s*tys\.\s*ocen/);
  assert.match(proofMarkup({ rating: 4.8, count: 23400 }, 'en'), /23\.4K ratings/);
  assert.equal(proofMarkup({ rating: null, count: 0 }, 'en'), '');
  assert.deepEqual(proofSlides({ rating: 4.8, count: 10 }, [{ id: 'a' }, { id: 'b' }]), ['a']);
  assert.deepEqual(proofSlides({}, [{ id: 'a' }]), []);
});

test('proof: refuses Apple-designated awards', () => {
  assert.throws(() => proofMarkup({ text: "Editors' Choice" }, 'en'), /Apple-designated/);
});

test('proof: a ranking or an award in your own line is flagged, a description is not', () => {
  assert.match(proofWarnings({ text: 'Best habit app' })[0], /ranking or an award/);
  assert.match(proofWarnings({ text: 'Najlepsza', sub: 'aplikacja pogodowa' })[0], /ranking or an award/);
  assert.match(proofWarnings({ text: 'Award-winning' })[0], /ranking or an award/);
  const plain = proofWarnings({ text: 'Calm & cosy', sub: 'good news, every day' });
  assert.equal(plain.length, 1);
  assert.match(plain[0], /Google Play/);
  assert.deepEqual(proofWarnings({ rating: 4.8, count: 2300 }), []);
});

test('proof: the laurel goes on the chosen slide and lowers its phone', () => {
  const slides = ['a', 'b'].map(id => ({ id, shot: id }));
  const html = buildDesign('clean', { slides, accent: '#2f9e55', look: { proof: { text: '1M', sub: 'downloads', slides: ['b'] } } });
  assert.equal(html.match(/class="proof"/g).length, 1);
  assert.match(html, /d-[a-z]+[^"]* with-proof" style="--i: 1/);
});

test('proof: fetches the real rating into look.proof', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'proof-'));
  writeFileSync(join(dir, 'screenshots.json'), JSON.stringify({ app: { ascAppId: '1' }, look: { proof: { slides: ['b'] } } }));
  const store = { dir, config: JSON.parse(readFileSync(join(dir, 'screenshots.json'), 'utf8')), locales: ['pl'] };
  const fetchImpl = async () => ({ json: async () => ({ results: [{ averageUserRating: 4.83, userRatingCount: 2300 }] }) });
  const r = await proof(store, { fetchImpl });
  assert.equal(r.rating, 4.8);
  const saved = JSON.parse(readFileSync(join(dir, 'screenshots.json'), 'utf8')).look.proof;
  assert.deepEqual([saved.rating, saved.count, saved.slides[0]], [4.8, 2300, 'b']);
  const none = await proof(store, { fetchImpl: async () => ({ json: async () => ({ results: [{ userRatingCount: 0 }] }) }) });
  assert.equal(none.rating, null);
});
