// Renders a design (one HTML strip of slides) for each device and locale, then cuts
// every .slide into its own store-ready PNG: exact size, RGB, no alpha.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from './browser.mjs';
import { frame, genericFrame } from './frames.mjs';
import { KIT_DIR } from './paths.mjs';
import { decodePng, pngInfo } from './png.mjs';
import { usage } from './errors.mjs';

const fileURL = path => pathToFileURL(path).href;

/**
 * A frame by name: "generic[/black|silver]" is drawn; anything else is an Apple bezel,
 * installed on first use. If that fails (offline, no 7z), the generic frame stands in and
 * the log says so: the output never silently differs from the config.
 */
function resolveFrame(name, device, log) {
  if (!name || name.startsWith('generic')) return genericFrame(device, name?.split('/')[1]);
  try {
    const f = frame(name);
    return { ...f, url: fileURL(f.file) };
  } catch (e) {
    log(`! frame "${name}" unavailable (${e.message.split('\n')[0]}); using the generic frame. Install Apple's with \`storeshots frames\`, or set "frame": "generic".`);
    return genericFrame(device);
  }
}

/** The design HTML with the kit, the slide size and window.SHOTS injected into <head>. */
function buildPage(store, device, locale, log = console.error) {
  const designFile = device.design;
  if (!existsSync(designFile)) throw usage(`design not found: ${designFile}`, { fix: 'run `storeshots init --style <name>` or point devices.<id>.design at an HTML file' });
  const html = readFileSync(designFile, 'utf8');

  const frameNames = new Set([device.frame, ...[...html.matchAll(/data-frame="([^"]+)"/g)].map(m => m[1])].filter(Boolean));
  const frames = {};
  for (const name of frameNames) {
    const f = resolveFrame(name, device, log);
    frames[name] = { url: f.url, width: f.width, height: f.height, screen: f.screen };
  }
  // Devices without data-frame use the device's frame; generic when none is set.
  if (!device.frame) frames.generic = (({ url, width, height, screen }) => ({ url, width, height, screen }))(genericFrame(device));

  const shotIds = new Set([...Object.keys(store.shots), ...[...html.matchAll(/data-shot="([^"]+)"/g)].map(m => m[1])]);
  const shots = {};
  for (const id of shotIds) {
    const file = store.rawShot(device.id, locale, id);
    if (existsSync(file)) shots[id] = fileURL(file);
  }

  const icon = store.app.icon ? resolve(store.dir, store.app.icon) : null;
  const data = {
    device: { id: device.id, width: device.width, height: device.height },
    locale,
    copy: store.copy(locale),
    shots,
    frames,
    defaultFrame: device.frame ?? 'generic',
    app: { name: store.app.name, subtitle: store.app.subtitle, icon: icon && existsSync(icon) ? fileURL(icon) : null },
  };
  const head = [
    `<base href="${fileURL(dirname(designFile))}/">`,
    `<style>:root{--slide-w:${device.width}px;--slide-h:${device.height}px;--u:${device.width / 100}px}</style>`,
    `<link rel="stylesheet" href="${fileURL(join(KIT_DIR, 'kit.css'))}">`,
    `<script>window.SHOTS=${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`,
    `<script src="${fileURL(join(KIT_DIR, 'kit.js'))}" defer></script>`,
  ].join('\n');
  // The kit goes first in <head> so the design's own CSS wins.
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => `${m}\n${head}`) : `<head>${head}</head>${html}`;
}

const lum = ([r, g, b]) => {
  const c = v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/**
 * WCAG contrast of each text against what is really behind it: the slide rendered with
 * transparent text. Returns the 10th-percentile contrast over the pixels under the box.
 */
function measureContrast(png, texts) {
  const { width, rgba } = decodePng(png);
  for (const t of texts) {
    if (!t.color || !t.box || t.box.width < 2) continue;
    const values = [];
    // A headline's own accent words (pills, gradient fills) are measured separately.
    const holes = t.role === 'accent' ? [] : texts.filter(o => o.role === 'accent' && o.key === `${t.key}#em` && o.box).map(o => o.hole ?? o.box);
    const inHole = (x, y) => holes.some(h => x >= h.x && x < h.x + h.width && y >= h.y && y < h.y + h.height);
    const step = Math.max(1, Math.floor(Math.sqrt((t.box.width * t.box.height) / 4000)));
    for (let y = Math.max(0, t.box.y); y < t.box.y + t.box.height; y += step) for (let x = Math.max(0, t.box.x); x < Math.min(width, t.box.x + t.box.width); x += step) {
      const i = (y * width + x) * 4;
      if (inHole(x, y)) continue;
      if (i + 2 < rgba.length) values.push(contrast(t.color, [rgba[i], rgba[i + 1], rgba[i + 2]]));
    }
    if (!values.length) continue;
    values.sort((a, b) => a - b);
    t.contrast = Math.round(values[Math.floor(values.length * 0.1)] * 100) / 100;
  }
}

/** Drops the alpha channel if Chrome produced one (the stores reject alpha). */
function flatten(buf) {
  if (!pngInfo(buf).hasAlpha) return buf;
  return execFileSync('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-pix_fmt', 'rgb24', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], { input: buf, maxBuffer: 256 << 20 });
}

export async function render(store, { devices, locales, slides: onlySlides, log = console.error }) {
  const browser = await launchBrowser();
  const results = [];
  try {
    for (const deviceId of devices) {
      const device = store.device(deviceId);
      for (const locale of locales) {
        mkdirSync(store.paths.build, { recursive: true });
        const pageFile = join(store.paths.build, `${deviceId}-${locale}.html`);
        writeFileSync(pageFile, buildPage(store, device, locale, log));

        const page = await browser.newPage({ viewport: { width: device.width, height: device.height }, deviceScaleFactor: 1 });
        const pageErrors = [];
        page.on('pageerror', e => pageErrors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });
        await page.goto(fileURL(pageFile), { waitUntil: 'load', timeout: 120000 });
        const report = await page.evaluate(() => window.__kit);
        report.problems.push(...pageErrors.map(message => ({ type: 'page-error', message })));

        // Widen the viewport to the whole strip so every slide can be clipped.
        await page.setViewportSize({ width: device.width * report.slides.length, height: device.height });
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

        const outDir = join(store.paths.final, deviceId, locale);
        mkdirSync(outDir, { recursive: true });
        // A full render replaces the set; a --slides render only rewrites those slides.
        if (!onlySlides) for (const old of readdirSync(outDir).filter(f => f.endsWith('.png'))) rmSync(join(outDir, old));
        const files = [];
        for (const [i, slide] of report.slides.entries()) {
          if (onlySlides && !onlySlides.includes(slide.id)) continue;
          const name = `${String(i + 1).padStart(2, '0')}-${slide.id}.png`;
          const buf = flatten(await page.screenshot({ clip: { x: i * device.width, y: 0, width: device.width, height: device.height }, type: 'png' }));
          writeFileSync(join(outDir, name), buf);
          files.push(name);
        }
        // Second pass with invisible text, to measure contrast against the real background.
        await page.addStyleTag({ content: '[data-text], [data-text] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }' });
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        for (const [i, slide] of report.slides.entries()) {
          const texts = report.texts.filter(t => t.slide === slide.id);
          if (!texts.length) continue;
          measureContrast(await page.screenshot({ clip: { x: i * device.width, y: 0, width: device.width, height: device.height }, type: 'png' }), texts);
        }
        writeFileSync(join(outDir, 'report.json'), JSON.stringify({ device: deviceId, locale, files, ...report }, null, 2));
        await page.close();

        const fitted = report.texts.filter(t => t.fontSize < t.startSize - 0.5).length;
        log(`rendered ${deviceId}/${locale}: ${files.length} slides${fitted ? `, ${fitted} text(s) shrunk to fit` : ''}${report.problems.length ? `, ${report.problems.length} problem(s)` : ''}`);
        for (const p of report.problems) log(`  ! ${JSON.stringify(p)}`);
        for (const t of report.texts.filter(t => t.overflow || t.outsideSlide)) log(`  ! text ${t.key} on ${t.slide}: ${t.overflow ? 'does not fit' : ''}${t.outsideSlide ? ' crosses the slide edge' : ''}`);
        results.push({ device: deviceId, locale, dir: outDir, files, problems: report.problems.length, shrunk: fitted });
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}
