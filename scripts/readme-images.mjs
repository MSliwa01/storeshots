#!/usr/bin/env node
// Regenerates the README images in docs/images/ from the demo project (fictional app,
// drawn device frame, so they can be published). Run after changing styles or the kit:
//   node examples/demo/make-captures.mjs && node scripts/readme-images.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from '../src/browser.mjs';
import { catalog } from '../src/catalog.mjs';
import { elements } from '../src/elements.mjs';
import { ROOT } from '../src/paths.mjs';
import { render } from '../src/render.mjs';
import { loadStore } from '../src/store.mjs';
import { writeStyle } from '../src/styles.mjs';

const out = join(ROOT, 'docs/images');
mkdirSync(out, { recursive: true });
const quiet = () => {};
const store = loadStore(join(ROOT, 'examples/demo/app'));
const url = f => pathToFileURL(f).href;

writeStyle(store, undefined);
const [set] = await render(store, { devices: store.devices, locales: store.locales, log: quiet });
const slides = set.files.map(f => join(set.dir, f));

// Styles: the first three slides in every style.
const styled = await catalog(store, { axis: 'style', count: 3, log: quiet });
const variant = name => join(store.paths.out, 'variants', `style-${name}`, 'final', set.device, set.locale);

// Pop-outs: the numbered candidates of one slide next to the slide built from the pick.
const marks = await elements(store, { slides: ['today'], top: 4 });

async function shoot(name, html, width) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width, height: 400 }, deviceScaleFactor: 1 });
    const file = join(out, `${name}.html`);
    writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#f3f3f5;font:500 22px/1.3 -apple-system,"Instrument Sans",system-ui,sans-serif;color:#55565c;width:${width}px}
      img{display:block;border-radius:22px;box-shadow:0 1px 2px rgba(0,0,0,.08),0 8px 24px rgba(0,0,0,.08)}
      .row{display:flex;gap:18px;justify-content:center} .cap{text-align:center;margin-top:12px}
    </style>${html}`);
    await page.goto(url(file));
    await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
    const height = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewportSize({ width, height });
    const png = join(out, `${name}.png`);
    await page.screenshot({ path: png });
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', png, '-q:v', '3', join(out, `${name}.jpg`)]);
    rmSync(png); rmSync(file);
  } finally {
    await browser.close();
  }
}

await shoot('set', `<div class="row" style="padding:48px 40px">${slides.map(f => `<img src="${url(f)}" style="width:280px">`).join('')}</div>`, 1840);

const names = styled.options.map(o => o.label).filter(n => n !== 'world');
await shoot('styles', `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:40px 56px;padding:48px 56px">${names.map(n => {
  const files = readdirSync(variant(n)).filter(f => f.endsWith('.png')).sort().slice(0, 3);
  return `<div><div class="row" style="gap:6px">${files.map(f => `<img src="${url(join(variant(n), f))}" style="width:272px;border-radius:16px">`).join('')}</div><div class="cap">${n}</div></div>`;
}).join('')}</div>`, 1840);

const result = slides.find(f => f.endsWith('-today.png'));
await shoot('pop-outs', `<div class="row" style="padding:44px;align-items:flex-start;gap:40px">
  <div><img src="${url(marks.slides[0].marks)}" style="height:760px;box-shadow:none;border-radius:0"><div class="cap">storeshots elements: candidates, numbered</div></div>
  <div><img src="${url(result)}" style="height:760px"><div class="cap">--pick 1: the card, cut along its own outline</div></div>
</div>`, 1500);

console.error(`docs/images: set.jpg, styles.jpg, pop-outs.jpg`);
