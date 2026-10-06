import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findElements, stems } from '../src/elements.mjs';

// A dark "app screen": black page, a hero card with text, three list rows, a tab bar.
function screen(W = 440, H = 956) {
  const rgba = new Uint8Array(W * H * 4);
  const paint = (x0, y0, w, h, rgb, r = 0) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const dx = Math.max(x0 + r - x - 0.5, 0, x + 0.5 - (x0 + w - r)), dy = Math.max(y0 + r - y - 0.5, 0, y + 0.5 - (y0 + h - r));
      if (r && dx * dx + dy * dy > r * r) continue;
      rgba.set([...rgb, 255], (y * W + x) * 4);
    }
  };
  paint(0, 0, W, H, [0, 0, 0]);
  paint(16, 80, 408, 270, [28, 28, 30], 24);                 // hero card
  paint(40, 120, 180, 40, [255, 255, 255]);                   // big "text"
  paint(40, 290, 90, 34, [48, 160, 85], 17);                  // green chip
  for (let i = 0; i < 3; i++) {
    paint(16, 380 + i * 80, 408, 66, [28, 28, 30], 14);       // list rows
    paint(36, 398 + i * 80, 60, 26, [235, 235, 235]);
    paint(120, 398 + i * 80, 110, 28, [[59, 125, 224], [242, 184, 34], [154, 107, 51]][i], 14);
  }
  paint(20, 880, 400, 60, [40, 40, 44], 30);                  // floating tab bar
  return { width: W, height: H, rgba };
}

test('elements: finds cards with their boxes and corner radii', () => {
  const found = findElements(screen());
  const hero = found.find(e => e.box[1] === 80);
  assert.ok(hero, JSON.stringify(found.map(e => e.box)));
  assert.deepEqual(hero.box, [16, 80, 408, 270]);
  assert.ok(Math.abs(hero.radius - 24) <= 4, `radius ${hero.radius}`);
  const rows = found.filter(e => e.kind === 'card' && e.box[3] === 66);
  assert.equal(rows.length, 3);
  assert.ok(rows.find(r => r.box[1] === 380).why.includes('first of a list'));
});

test('elements: leaves out the status bar and the tab bar', () => {
  const found = findElements(screen());
  assert.ok(!found.some(e => e.box[1] >= 870), JSON.stringify(found.map(e => e.box)));
});

test('elements: copy stems ignore case, accents and markup', () => {
  assert.deepEqual(stems('Water *every plant*'), ['water', 'every', 'plant']);
  assert.deepEqual(stems('Łąka, ćwiczenia o 18:00'), ['laka', 'cwicz', '18:00']);
});

// A light "app screen" with one tall card holding three text blocks, and two stacked inner cards.
function blocksScreen(W = 440, H = 956) {
  const rgba = new Uint8Array(W * H * 4);
  const paint = (x0, y0, w, h, rgb, r = 0) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const dx = Math.max(x0 + r - x - 0.5, 0, x + 0.5 - (x0 + w - r)), dy = Math.max(y0 + r - y - 0.5, 0, y + 0.5 - (y0 + h - r));
      if (r && dx * dx + dy * dy > r * r) continue;
      rgba.set([...rgb, 255], (y * W + x) * 4);
    }
  };
  // Text: glyph-sized marks with gaps, not one solid bar (which would itself be a surface).
  const text = (x0, y0, w, h, rgb) => { for (let x = x0; x + 2 <= x0 + w; x += Math.max(4, h / 3)) paint(x, y0, Math.max(2, Math.round(h / 5)), h, rgb); };
  paint(0, 0, W, H, [242, 242, 247]);
  paint(16, 80, 408, 330, [255, 255, 255], 24);           // tall card
  text(36, 100, 120, 18, [20, 20, 20]);                    // header line
  text(36, 170, 200, 40, [20, 20, 20]);                    // big "Tomorrow"
  text(36, 228, 240, 16, [90, 90, 90]);                    // date
  paint(36, 262, 80, 30, [48, 160, 85], 15);               // chip
  paint(16, 470, 408, 70, [255, 255, 255], 14);            // pair: card one
  paint(16, 552, 408, 110, [255, 255, 255], 14);           //       card two (12 px gutter)
  text(36, 490, 150, 20, [20, 20, 20]); text(36, 580, 120, 20, [20, 20, 20]);
  return { width: W, height: H, rgba };
}

test('elements: blocks inside a card get even padding from the card, corners concentric', () => {
  const found = findElements(blocksScreen());
  const block = found.find(e => e.kind === 'block' && e.box[1] === 170 && e.box[1] + e.box[3] === 292 && e.box[0] === 36);
  assert.ok(block, JSON.stringify(found.filter(e => e.kind === 'block').map(e => [e.box, e.pad])));
  assert.equal(block.cut, 'frame');
  assert.equal(block.pad, 20);                              // the card's own inner margin (36 − 16)
  assert.equal(block.behind, '#ffffff');
});

test('elements: a pair of stacked cards pads by its gutter; cards are cut as surfaces', () => {
  const found = findElements(blocksScreen());
  const pair = found.find(e => e.kind === 'pair');
  assert.deepEqual(pair.box, [16, 470, 408, 192]);
  assert.equal(pair.pad, 14);                               // gutter 12, clamped to at least 14
  assert.ok(Math.abs(pair.radius - (14 + 14)) <= 2, `radius ${pair.radius}`); // child radius (measured ≈ 14) + padding
  const card = findElements(screen()).find(e => e.box[1] === 80);
  assert.equal(card.cut, 'surface');
  assert.equal(card.fill, '#1c1c1e');
});

test('elements: a full-width row is snapped to its card symmetrically, not to its ink', () => {
  const W = 440, H = 956, rgba = new Uint8Array(W * H * 4);
  const paint = (x0, y0, w, h, rgb) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) rgba.set([...rgb, 255], (y * W + x) * 4); };
  paint(0, 0, W, H, [242, 242, 247]);
  paint(20, 80, 400, 600, [255, 255, 255]);                 // card, inner margin 16 → grid 36..404
  for (let row = 0; row < 4; row++) for (let col = 0; col < 7; col++) {
    const x = 36 + col * 53, y = 120 + row * 130;
    if (col === 6) paint(x, y, 50, 40, [246, 236, 217]);      // last day: a filled chip (ends at 404)
    else for (let k = 0; k < 4; k++) paint(x + 14 + k * 6, y + 10, 3, 20, [20, 20, 20]); // a bare number
  }
  const rows = findElements({ width: W, height: H, rgba }).filter(e => e.kind === 'block' && e.box[3] < 60);
  assert.ok(rows.length, 'no week rows found');
  for (const r of rows) {
    assert.equal(r.box[0] - 20, 420 - (r.box[0] + r.box[2]), `asymmetric box ${r.box}`);
    assert.equal(r.box[0], 36);
  }
});
