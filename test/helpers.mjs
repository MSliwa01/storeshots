import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng } from '../src/png.mjs';

export const tmp = () => mkdtempSync(join(tmpdir(), 'storeshots-test-'));

/** Solid-colour PNG; `paint(x, y)` may return [r,g,b,a] per pixel. */
export function png(width, height, { colour = [20, 40, 60, 255], alpha = false, paint } = {}) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rgba.set(paint?.(x, y) ?? colour, (y * width + x) * 4);
  return encodePng(width, height, rgba, { alpha });
}

/** A store project with rendered files and a render report, ready for `check`. */
export function fakeStore({ files = 3, width = 1320, height = 2868, alpha = false, texts = [] } = {}) {
  const dir = tmp();
  writeFileSync(join(dir, 'screenshots.json'), JSON.stringify({ app: { name: 'Test' }, locales: ['en'], devices: { 'iphone-6.9': {} }, shots: {} }));
  const out = join(dir, 'output/final/iphone-6.9/en');
  mkdirSync(out, { recursive: true });
  const names = [];
  const image = png(width, height, { alpha });
  for (let i = 1; i <= files; i++) {
    const name = `0${i}-slide${i}.png`;
    writeFileSync(join(out, name), image);
    names.push(name);
  }
  writeFileSync(join(out, 'report.json'), JSON.stringify({ files: names, slides: names.map((_, i) => ({ id: `slide${i + 1}` })), texts, problems: [] }));
  return dir;
}
