// Review images for the agent and the user:
//   <device>-<locale>-sheet.png   the whole set side by side
//   <device>-<locale>-store.html  a simulated App Store (search among competitors, product
//                                  page, dark mode): open it in a browser
//   <device>-<locale>-search.png  its search results, and -page.png its product page, on a
//                                  real-size iPhone screen (the thumbnail test)
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from './browser.mjs';
import { LOCAL_FONTS } from './fonts.mjs';
import { REFS_DIR, refListing } from './refs.mjs';
import { storeSimHTML } from './storesim.mjs';

const fileURL = path => pathToFileURL(path).href;
const escape = text => String(text ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function sheetHTML(files, device) {
  const height = 1100, width = Math.round(height * device.width / device.height);
  return `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:64px;background:#d8d8de;width:max-content;display:flex;gap:40px;font:500 26px system-ui,sans-serif;color:#55555c">
${files.map(f => `<figure style="margin:0;width:${width}px"><img src="${fileURL(f.path)}" style="display:block;width:${width}px;height:${height}px;border-radius:28px;box-shadow:0 12px 40px rgba(0,0,0,.18)"><figcaption style="margin-top:18px">${escape(f.name)}</figcaption></figure>`).join('\n')}
</body>`;
}

// The whole set at search-result size (~200 px per slide), with a line after slide 3:
// only slides 1–3 show in search results.
function stripHTML(files, device) {
  const width = 200, height = Math.round(width * device.height / device.width);
  return `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;background:#fff;width:max-content;display:flex;gap:10px;align-items:center;font:600 14px system-ui,sans-serif;color:#8a8a8e">
${files.map((f, i) => `<img src="${fileURL(f.path)}" style="display:block;width:${width}px;height:${height}px;border-radius:18px;border:.5px solid rgba(0,0,0,.12)">${i === 2 && files.length > 3 ? '<div style="width:3px;align-self:stretch;background:#ff3b30;border-radius:2px"></div>' : ''}`).join('\n')}
</body>`;
}

export async function review(store, { devices, locales, log = console.error }) {
  const browser = await launchBrowser();
  const outputs = [];
  try {
    mkdirSync(store.paths.review, { recursive: true });
    mkdirSync(store.paths.build, { recursive: true });
    for (const deviceId of devices) {
      const device = store.device(deviceId);
      for (const locale of locales) {
        const dir = join(store.paths.final, deviceId, locale);
        const files = existsSync(dir) ? readdirSync(dir).filter(f => /^\d+-.+\.png$/.test(f)).sort().map(name => ({ name, path: join(dir, name) })) : [];
        if (!files.length) { log(`skip ${deviceId}/${locale}: nothing rendered`); continue; }

        // Pages load from file:// so they may read the local PNGs.
        const open = async (page, name, html) => {
          const file = join(store.paths.build, name);
          writeFileSync(file, html);
          await page.goto(fileURL(file), { waitUntil: 'load' });
          // Size the viewport to the content so a short set leaves no blank margin.
          const size = await page.evaluate(() => ({ width: document.body.scrollWidth, height: document.body.scrollHeight }));
          if (size.width < page.viewportSize().width) await page.setViewportSize({ width: size.width, height: page.viewportSize().height });
        };
        const sheet = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 0.5 });
        await open(sheet, `${deviceId}-${locale}-sheet.html`, sheetHTML(files, device));
        const sheetFile = join(store.paths.review, `${deviceId}-${locale}-sheet.png`);
        await sheet.screenshot({ path: sheetFile, fullPage: true });
        await sheet.close();

        // The simulated store: the set between the competitors named in review.competitors
        // (folders of the reference library, e.g. "pl/accuweather-weather-forecast").
        const competitors = [];
        for (const ref of store.config.review?.competitors ?? []) {
          try { const l = await refListing(join(REFS_DIR, ref)); competitors.push({ ...l, icon: l.icon && fileURL(l.icon), shots: l.shots.map(fileURL) }); }
          catch (e) { log(`! competitor ${ref}: ${e.message}`); }
        }
        const icon = store.app.icon && existsSync(resolve(store.dir, store.app.icon)) ? fileURL(resolve(store.dir, store.app.icon)) : null;
        const listing = { name: store.app.name, subtitle: store.app.subtitle, icon, rating: store.app.rating ?? 4.8, ratings: store.app.ratings ?? 1200, seller: store.app.seller, shots: files.map(f => fileURL(f.path)), description: store.app.subtitle };
        const sf = existsSync(join(LOCAL_FONTS, 'SF-Pro-Display-Regular.otf')) ? fileURL(LOCAL_FONTS) : null;
        const sim = view => storeSimHTML({ listing, competitors, locale, query: store.app.searchQuery, view, fontBase: sf });
        const storeFile = join(store.paths.review, `${deviceId}-${locale}-store.html`);
        writeFileSync(storeFile, sim('search'));
        const shots = {};
        for (const view of ['search', 'page']) {
          const page = await browser.newPage({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
          const file = join(store.paths.build, `${deviceId}-${locale}-${view}.html`);
          writeFileSync(file, sim(view));
          await page.goto(fileURL(file), { waitUntil: 'load' });
          await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
          shots[view] = join(store.paths.review, `${deviceId}-${locale}-${view}.png`);
          await page.screenshot({ path: shots[view] });
          await page.close();
        }
        const searchFile = shots.search;

        const strip = await browser.newPage({ viewport: { width: 1000, height: 100 }, deviceScaleFactor: 1 });
        await open(strip, `${deviceId}-${locale}-strip.html`, stripHTML(files, device));
        const stripFile = join(store.paths.review, `${deviceId}-${locale}-strip.png`);
        await strip.screenshot({ path: stripFile, fullPage: true });
        await strip.close();

        log(`review ${deviceId}/${locale}:\n  ${sheetFile}\n  ${searchFile}\n  ${shots.page}\n  ${stripFile}\n  ${storeFile}`);
        outputs.push({ device: deviceId, locale, sheet: sheetFile, search: searchFile, page: shots.page, strip: stripFile, store: storeFile });
      }
    }
  } finally {
    await browser.close();
  }
  return outputs;
}
