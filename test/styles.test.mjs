import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDesign, contrastOf, liftSize, slideColours } from '../src/styles.mjs';

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

test('art: slides[].art places the app\'s own art; closer art replaces the icon; backdrops go behind', async () => {
  const { buildDesign } = await import('../src/styles.mjs');
  const slides = [
    { id: 'a', shot: 'a', art: { asset: 'frog', place: 'beside' } },
    { id: 'b', shot: 'b', art: [{ asset: 'leaf', place: 'peek', side: 'left' }, { asset: 'hills', place: 'backdrop' }] },
    { id: 'c', shot: 'c' }, { id: 'd', shot: 'd' },
    { id: 'end', shot: null, art: 'cat' },
  ];
  const html = buildDesign('soft', { slides, accent: '#2f9e55' });
  assert.match(html, /<img class="art a-beside on-right at-hero" data-asset="frog"/);
  assert.match(html, /<img class="art a-peek on-left at-\w+" data-asset="leaf"/);
  assert.match(html, /<div class="art-backdrop" data-asset="hills" style="left: calc\(var\(--slide-w\) \* 1\)/);
  assert.match(html, /<img class="closer-icon closer-art" data-asset="cat"/);
  assert.doesNotMatch(html, /data-app-icon/);
});

test('look.font: bundled rounded fonts are copied next to the design and override the style', async () => {
  const { buildDesign } = await import('../src/styles.mjs');
  const { tmp } = await import('./helpers.mjs');
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = tmp();
  const html = buildDesign('clean', { slides: [{ id: 'a', shot: 'a' }], accent: '#2f9e55', look: { font: 'fredoka' }, designDir: dir });
  assert.match(html, /<style data-look-font>[\s\S]*font-family: "Fredoka"[\s\S]*<\/style>\n<\/head>/);
  assert.ok(existsSync(join(dir, 'fonts', 'Fredoka.ttf')));
  assert.throws(() => buildDesign('clean', { slides: [{ id: 'a', shot: 'a' }], look: { font: 'comic' } }), /unknown font/);
});

test('zoom: a slide with a focus gets an enlarged, cut phone; without one it falls back to hero', () => {
  const html = buildDesign('clean', { slides: [{ id: 'a', shot: 'a', layout: 'zoom', focus: [100, 600, 700, 400] }, { id: 'b', shot: 'b', layout: 'zoom' }], accent: '#2f9e55', screenHeight: 2868 });
  assert.match(html, /class="device d-zoom" data-cross data-focus="100 600 700 400"/);
  assert.match(html, /class="device d-hero[^"]*" style="--i: 1"/);
});

test('pieces: placed by the kit unless given a spot; upright unless asked to lean; sized by their text', () => {
  const slides = [{ id: 'a', shot: 'a', pieces: [{ box: [0, 0, 400, 300] }, { box: [0, 400, 400, 300], at: [30, 60], rim: true }, { box: [0, 800, 1000, 200], tilt: true, text: { key: 40, min: 30, words: 6 } }] }];
  const html = buildDesign('clean', { slides, accent: '#2f9e55', screenHeight: 2868 });
  assert.match(html, /<div class="piece" data-over style="--i: 0; --at-x: 50; --at-y: 50; --size: 58;/);
  assert.match(html, /<div class="piece rim" style="--i: 0; --at-x: 30; --at-y: 60/);
  // 40 px capitals across 1000 px reach 3.75 % of the slide at 94 % wide: capped at 92.
  assert.match(html, /<div class="piece" data-over data-tilt data-key="40" data-min="30" data-words="6" style="--i: 0; --at-x: 50; --at-y: 50; --size: 92;/);
  assert.equal(liftSize({ box: [0, 0, 600, 100], text: { key: 60, min: 40, words: 3 } }), 40);
  assert.equal(liftSize({ box: [0, 0, 600, 100], text: { key: 30, min: 30, words: 3 } }), 75);
  assert.equal(liftSize({ box: [0, 0, 600, 100], size: 50, text: { key: 30, min: 30, words: 3 } }), 50);
});

test('look.blur: backdrops blurred in place, or a blurred copy behind the caption (below it on a hanging phone)', () => {
  const slides = [{ id: 'a', shot: 'a', art: { asset: 'hills', place: 'backdrop' } }, { id: 'b', shot: 'b', layout: 'hang', art: { asset: 'hills', place: 'backdrop' } }];
  const soft = buildDesign('world', { slides, accent: '#2f68ab', look: { blur: 'soft' } });
  assert.equal(soft.match(/class="art-backdrop blurred soft"/g).length, 2);
  const caption = buildDesign('world', { slides, accent: '#2f68ab', look: { blur: 'caption' } });
  assert.equal(caption.match(/class="art-backdrop"/g).length, 2);
  assert.match(caption, /class="art-backdrop blurred caption" data-asset="hills" style="left: calc\(var\(--slide-w\) \* 0\)"/);
  assert.match(caption, /class="art-backdrop blurred caption low" data-asset="hills" style="left: calc\(var\(--slide-w\) \* 1\)"/);
  const strip = buildDesign('world', { slides: [{ id: 'a', shot: 'a' }], accent: '#2f68ab', look: { background: { asset: 'hills' }, blur: 'strong' } });
  assert.match(strip, /class="backdrop blurred strong" data-asset="hills"/);
});

test('spread: one phone over a slide and the next; the next gets none; never over the closer', () => {
  const slides = [{ id: 'a', shot: 'a', layout: 'spread' }, { id: 'b', shot: 'b' }, { id: 'c', shot: 'c' }, { id: 'd', shot: 'd', layout: 'spread' }, { id: 'end', shot: null }];
  const html = buildDesign('clean', { slides, accent: '#2f9e55' });
  assert.match(html, /<div class="spread-half" style="--i: 0"><div class="device d-spread" data-cross style="--i: 0" data-shot="a"><\/div><\/div>/);
  assert.match(html, /<div class="spread-half" style="--i: 1"><div class="device d-spread twin" data-cross style="--i: 0" data-shot="a"><\/div><\/div>/);
  assert.doesNotMatch(html, /class="device[^"]*" style="--i: 1"/);
  // The next slide is the closer, so slide d falls back to a phone of its own.
  assert.equal(html.match(/class="device d-spread/g).length, 2);
  assert.match(html, /class="device d-hero[^"]*" style="--i: 3"/);
});

test('free: no phone; float art sits in front at its spot', () => {
  const slides = [{ id: 'a', shot: 'a' }, { id: 'w', shot: null, layout: 'free', art: [{ asset: 'widget', place: 'float', at: [30, 70], size: 42 }] }, { id: 'end', shot: null }];
  const html = buildDesign('clean', { slides, accent: '#2f9e55' });
  assert.doesNotMatch(html, /class="device[^"]*" style="--i: 1"/);
  assert.match(html, /<img class="art a-float on-left at-free" data-asset="widget" style="--i: 1; --art-w: 42; --at-x: 30; --at-y: 70"/);
});

test('float art: a photo gets rounded corners and a crop; behind puts it under the phones', () => {
  const slides = [{ id: 'a', shot: 'a', art: [{ asset: 'photo', place: 'float', at: [50, 56], size: 84, aspect: '4/5', radius: 5, behind: true }] }, { id: 'b', shot: 'b' }];
  const html = buildDesign('clean', { slides, accent: '#2f9e55' });
  assert.match(html, /<img class="art a-float on-right at-\w+ behind" data-asset="photo" style="[^"]*; border-radius: calc\(var\(--u\) \* 5\); aspect-ratio: 4\/5; object-fit: cover"/);
});

test('type: big headlines, no subtitles but on the closer, emphasis without the box, the laurel on top', async () => {
  const { tmp } = await import('./helpers.mjs');
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const slides = [{ id: 'a', shot: 'a' }, { id: 'b', shot: null, layout: 'free', caption: 'middle', headline: 'huge' }, { id: 'c', shot: 'c' }, { id: 'd', shot: 'd' }, { id: 'end', shot: null }];
  const look = { headline: 'big', subtitles: false, emphasis: 'serif', proof: { text: 'Calm & cosy', sub: 'good news', at: 'top' } };
  const dir = tmp();
  const html = buildDesign('clean', { slides, accent: '#2f9e55', look, designDir: dir });
  assert.match(html, /<style data-look-type>[\s\S]*calc\(var\(--u\) \* 13\.4\)[\s\S]*"Fraunces Italic"[\s\S]*color: inherit/);
  assert.ok(existsSync(join(dir, 'fonts', 'Fraunces-Italic.ttf')));
  assert.equal(html.match(/data-role="sub"/g).length, 1);
  assert.match(html, /<section class="slide c-closer[\s\S]*data-role="sub"/);
  assert.match(html, /<div class="caption">\s*<div class="proof">[\s\S]*?<h1 data-text="a\.title"/);
  assert.match(html, /<div class="caption middle huge">\s*<h1 data-text="b\.title" data-fit data-role="title" data-lines="3">/);
  const colour = buildDesign('clean', { slides, accent: '#2f9e55', look: { emphasis: { style: 'colour', colour: '#237740' } } });
  assert.match(colour, /\.slide h1 em \{[^}]*background: none !important;[^}]*color: #237740 !important;/);
  assert.doesNotMatch(buildDesign('clean', { slides, accent: '#2f9e55' }), /data-look-type/);
  assert.throws(() => buildDesign('clean', { slides, accent: '#2f9e55', look: { emphasis: 'glow' } }), /unknown look.emphasis/);
});
