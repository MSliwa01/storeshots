import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDesign, contrastOf, slideColours } from '../src/styles.mjs';

const slides = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, shot: id }));

test('slide colours: text and pill reach 4.5:1 on every field', () => {
  for (const accent of ['#2f9e55', '#3b82f6', '#f2b822', '#e5484d', '#8e4ec6', '#cccccc']) {
    for (const c of slideColours(slides, { accent })) {
      assert.ok(contrastOf(c.fg, c.bg) >= 4.5, `${accent}: ${c.fg} on ${c.bg}`);
      assert.ok(contrastOf(c.pillFg, c.pillBg) >= 4.5, `${accent}: pill ${c.pillFg} on ${c.pillBg}`);
    }
  }
});

test('slide colours: palette and per-slide bg win; light fields get ink text', () => {
  const [green, yellow, own] = slideColours([{ id: 'a' }, { id: 'b' }, { id: 'c', bg: '#111111' }], { palette: ['#2f9e55', '#f2b822'] });
  assert.equal(green.fg, '#ffffff');
  assert.equal(yellow.fg, '#14161c');
  assert.equal(yellow.bg, '#f2b822');
  assert.equal(own.bg, '#111111');
});

test('slide colours: the derived palette is not one hue', () => {
  const hues = new Set(slideColours(slides, { accent: '#2f9e55' }).map(c => c.bg));
  assert.equal(hues.size, slides.length);
});

test('poster design: one field per slide, colours on each section', () => {
  const html = buildDesign('poster', { slides, accent: '#2f9e55' });
  assert.equal(html.match(/class="field"/g).length, slides.length);
  assert.equal(html.match(/<section [^>]*--pill-bg/g).length, slides.length);
  assert.doesNotMatch(html, /\{\{\w+\}\}/);
});
