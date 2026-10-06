// Review images for the agent and the user:
//   <device>-<locale>-sheet.png   the whole set side by side
//   <device>-<locale>-search.png  an App Store search result and product page on a
//                                  real-size iPhone screen (the thumbnail test)
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from './browser.mjs';

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

function searchHTML(files, store, locale) {
  const pl = locale.startsWith('pl');
  const icon = store.app.icon && existsSync(resolve(store.dir, store.app.icon)) ? fileURL(resolve(store.dir, store.app.icon)) : '';
  const thumb = (f, w) => `<img src="${fileURL(f.path)}" style="width:${w}px;aspect-ratio:${store.ratio};border-radius:${w * 0.09}px;border:.5px solid rgba(0,0,0,.12);display:block;flex:none">`;
  return `<!doctype html><meta charset="utf-8"><body style="margin:0;width:440px;height:956px;overflow:hidden;background:#fff;font-family:system-ui,'Inter',sans-serif;color:#000">
<div style="padding:64px 20px 0">
  <div style="font-size:34px;font-weight:700;letter-spacing:-.5px">${pl ? 'Szukaj' : 'Search'}</div>
  <div style="margin-top:10px;height:38px;border-radius:12px;background:#efeff0;display:flex;align-items:center;padding:0 12px;color:#3c3c43;font-size:17px">🔍&nbsp; ${escape(store.app.searchQuery ?? store.app.name ?? '')}</div>
  <div style="margin-top:22px;display:flex;align-items:center;gap:12px">
    ${icon ? `<img src="${icon}" style="width:64px;height:64px;border-radius:15px;border:.5px solid rgba(0,0,0,.1)">` : '<div style="width:64px;height:64px;border-radius:15px;background:#ddd"></div>'}
    <div style="flex:1;min-width:0"><div style="font-size:16px;font-weight:600">${escape(store.app.name)}</div><div style="font-size:13px;color:#8a8a8e;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escape(store.app.subtitle ?? '')}</div><div style="font-size:11px;color:#8a8a8e;margin-top:4px">★★★★★</div></div>
    <div style="background:#eeeef3;color:#0a7aff;font-weight:700;font-size:15px;padding:6px 18px;border-radius:999px">${pl ? 'Pobierz' : 'Get'}</div>
  </div>
  <div style="margin-top:14px;display:flex;gap:8px">${files.slice(0, 3).map(f => thumb(f, (400 - 16) / 3)).join('')}</div>
  <div style="margin-top:36px;font-size:22px;font-weight:700">${pl ? 'Strona aplikacji' : 'Product page'}</div>
  <div style="margin-top:12px;display:flex;gap:10px;width:max-content">${files.slice(0, 3).map(f => thumb(f, 232)).join('')}</div>
</div></body>`;
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

        const search = await browser.newPage({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
        await open(search, `${deviceId}-${locale}-search.html`, searchHTML(files, { ...store, ratio: `${device.width} / ${device.height}` }, locale));
        const searchFile = join(store.paths.review, `${deviceId}-${locale}-search.png`);
        await search.screenshot({ path: searchFile });
        await search.close();

        const strip = await browser.newPage({ viewport: { width: 1000, height: 100 }, deviceScaleFactor: 1 });
        await open(strip, `${deviceId}-${locale}-strip.html`, stripHTML(files, device));
        const stripFile = join(store.paths.review, `${deviceId}-${locale}-strip.png`);
        await strip.screenshot({ path: stripFile, fullPage: true });
        await strip.close();

        log(`review ${deviceId}/${locale}:\n  ${sheetFile}\n  ${searchFile}\n  ${stripFile}`);
        outputs.push({ device: deviceId, locale, sheet: sheetFile, search: searchFile, strip: stripFile });
      }
    }
  } finally {
    await browser.close();
  }
  return outputs;
}
