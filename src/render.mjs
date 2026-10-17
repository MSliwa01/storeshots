// Renders a design (one HTML strip of slides) for each device and locale, then cuts
// every .slide into its own store-ready PNG: exact size, RGB, no alpha.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from './browser.mjs';
import { frame, genericFrame, plainFrame } from './frames.mjs';
import { KIT_DIR } from './paths.mjs';
import { decodePng, pngInfo } from './png.mjs';
import { resolveAssets } from './assets.mjs';
import { usage } from './errors.mjs';
import { screenWords } from './ocr.mjs';

const fileURL = path => pathToFileURL(path).href;

/**
 * A frame by name: "generic[/black|silver]", "plain[/colour[/width]]" and "none" are drawn;
 * anything else is an Apple bezel,
 * installed on first use. If that fails (offline, no 7z), the generic frame stands in and
 * the log says so: the output never silently differs from the config.
 */
function resolveFrame(name, device, log) {
  if (!name || name.startsWith('generic')) return genericFrame(device, name?.split('/')[1]);
  if (name.startsWith('plain') || name === 'none') return plainFrame(device, name);
  try {
    const f = frame(name);
    return { ...f, url: fileURL(f.file) };
  } catch (e) {
    log(`! frame "${name}" unavailable (${e.message.split('\n')[0]}); using the generic frame. Install Apple's with \`storeshots frames\`, or set "frame": "generic".`);
    return genericFrame(device);
  }
}

/** The design HTML with the kit, the slide size and window.SHOTS injected into <head>. */
function buildPage(store, device, locale, log = console.error, assets = {}) {
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
  const shots = {}, words = {};
  for (const id of shotIds) {
    const file = store.shotFile(device.id, locale, id);
    if (existsSync(file)) shots[id] = fileURL(file);
  }
  // The words on each phone's screen (OCR), so the kit can tell when a card, a pop-out or art
  // half-covers one, or a slide's edge cuts one.
  for (const id of new Set([...html.matchAll(/data-shot="([^"]+)"/g)].map(m => m[1]))) {
    const file = store.shotFile(device.id, locale, id);
    if (existsSync(file)) words[id] = screenWords(file, locale);
  }

  const icon = store.app.icon ? resolve(store.dir, store.app.icon) : null;
  const data = {
    device: { id: device.id, width: device.width, height: device.height },
    locale,
    copy: store.copy(locale),
    shots,
    words,
    frames,
    defaultFrame: device.frame ?? 'generic',
    app: { name: store.app.name, subtitle: store.app.subtitle, icon: icon && existsSync(icon) ? fileURL(icon) : null },
    assets,
  };
  const head = [
    `<base href="${fileURL(dirname(designFile))}/">`,
    `<style>:root{--slide-w:${device.width}px;--slide-h:${device.height}px;--u:${device.width / 100}px}</style>`,
    `<link rel="stylesheet" href="${fileURL(join(KIT_DIR, 'kit.css'))}">`,
    `<script>window.SHOTS=${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`,
    `<script src="${fileURL(join(KIT_DIR, 'typeset.js'))}" defer></script>`,
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

const hex = ([r, g, b]) => `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const luma = (rgba, i) => (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;

/**
 * Where each text's glyphs are, from the mask pass (black text on white, nothing else
 * drawn). Eroded by a pixel so anti-aliased edges don't count.
 */
const inkAt = (mask, x, y) => {
  const { width, height, rgba } = mask;
  if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return false;
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (rgba[((y + dy) * width + x + dx) * 4] > 110) return false;
  return true;
};
const differ = (a, b, i, by) => Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > by;

/**
 * WCAG contrast of each text against what is really behind it: the slide rendered with
 * transparent text (`bare`). Solid text: its colour against the 10th-percentile pixel under
 * its box. Gradient or translucent text: the rendered glyph pixels (`full`) against the
 * pixels behind them. Also records the ground (median colour, busyness) for fix hints.
 */
function measureContrast(full, bare, mask, probe, texts) {
  const { width, rgba } = bare;
  for (const t of texts) {
    if (!t.box || t.box.width < 2) continue;
    const values = [], ground = [], ink = [];
    // A headline's own accent words (pills, gradient fills) are measured separately.
    const holes = t.role === 'accent' ? [] : texts.filter(o => o.role === 'accent' && o.key === `${t.key}#em` && o.box).map(o => o.hole ?? o.box);
    const inHole = (x, y) => holes.some(h => x >= h.x && x < h.x + h.width && y >= h.y && y < h.y + h.height);
    const step = Math.max(1, Math.floor(Math.sqrt((t.box.width * t.box.height) / 4000)));
    for (let y = Math.max(0, t.box.y); y < t.box.y + t.box.height; y += step) for (let x = Math.max(0, t.box.x); x < Math.min(width, t.box.x + t.box.width); x += step) {
      const i = (y * width + x) * 4;
      if (i + 2 >= rgba.length || inHole(x, y)) continue;
      const behind = [rgba[i], rgba[i + 1], rgba[i + 2]];
      ground.push(behind);
      if (t.color) values.push(contrast(t.color, behind));
      else if (inkAt(mask, x, y) && differ(probe.rgba, rgba, i, 40)) ink.push(contrast([full.rgba[i], full.rgba[i + 1], full.rgba[i + 2]], behind));
    }
    if (!t.color) values.push(...ink);
    if (ground.length) {
      const l = ground.map(([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255), mean = l.reduce((a, b) => a + b, 0) / l.length;
      const mid = [0, 1, 2].map(c => ground.map(p => p[c]).sort((a, b) => a - b)[Math.floor(ground.length / 2)]);
      t.ground = { colour: hex(mid), busy: Math.round(Math.sqrt(l.reduce((a, v) => a + (v - mean) ** 2, 0) / l.length) * 100) / 100 };
    }
    if (values.length < 12) continue;
    values.sort((a, b) => a - b);
    t.contrast = Math.round(values[Math.floor(values.length * 0.1)] * 100) / 100;
    if (!t.color) t.contrastFrom = 'pixels';
  }
}

/**
 * Letters hidden behind something drawn over them (a phone, a pop-out, art): glyph pixels
 * (mask pass) where the slide looks the same with the text in magenta (probe pass) as
 * without it. The probe colour keeps faint text from passing for hidden text. Per letter, as
 * shares of the letter and of its top half (the top half is what the eye reads).
 */
function measureOcclusion(probe, bare, mask, texts) {
  const { width, height } = probe;
  for (const t of texts) {
    if (t.role === 'accent' || !t.letters?.length) continue;
    let inkAll = 0, hiddenAll = 0;
    t.hidden = [];
    for (const l of t.letters) {
      const step = Math.max(1, Math.floor(Math.sqrt((l.width * l.height) / 1500)));
      let ink = 0, hidden = 0, inkTop = 0, hiddenTop = 0;
      for (let y = Math.max(0, l.y); y < Math.min(height, l.y + l.height); y += step) for (let x = Math.max(0, l.x); x < Math.min(width, l.x + l.width); x += step) {
        if (!inkAt(mask, x, y)) continue;
        const i = (y * width + x) * 4, gone = !differ(probe.rgba, bare.rgba, i, 40), top = y < l.y + l.height / 2;
        ink++; if (gone) hidden++;
        if (top) { inkTop++; if (gone) hiddenTop++; }
      }
      inkAll += ink; hiddenAll += hidden;
      if (ink < 6) continue;
      const share = hidden / ink, topShare = inkTop ? hiddenTop / inkTop : 0;
      if (share >= 0.4 || topShare >= 0.55) t.hidden.push({ c: l.c, share: Math.round(share * 100) / 100, top: Math.round(topShare * 100) / 100 });
    }
    t.hiddenShare = inkAll ? Math.round((hiddenAll / inkAll) * 100) / 100 : 0;
  }
}

/**
 * The tallest band across a slide with nothing in it: rows without a single sharp edge.
 * Gradients, glows and blurs are smooth; text, phones, UI and art are not.
 */
function emptyBand({ width, height, rgba }) {
  let best = { from: 0, size: 0 }, start = null;
  const rowStep = 4, colStep = 2, jump = 0.06 * 255;
  for (let y = 0; y <= height; y += rowStep) {
    let edges = 0;
    if (y < height) for (let x = 0, prev = null; x < width; x += colStep) {
      const i = (y * width + x) * 4, l = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
      if (prev !== null && Math.abs(l - prev) > jump) edges++;
      prev = l;
    }
    const empty = y < height && edges < 3;
    if (empty && start === null) start = y;
    if (!empty && start !== null) { if (y - start > best.size) best = { from: start, size: y - start }; start = null; }
  }
  return best;
}

/**
 * The slide's ground: the median colour of a thin ring along its edges (the caption sits
 * inside it, phones only cross it), as HSL lightness and saturation in %.
 */
function groundOf({ width, height, rgba }) {
  const ls = [], ss = [], edge = Math.max(4, Math.round(width * 0.03)), push = (x, y) => {
    const i = (y * width + x) * 4, [r, g, b] = [rgba[i], rgba[i + 1], rgba[i + 2]].map(v => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    ls.push(l * 100); ss.push(max === min ? 0 : ((max - min) / (l > 0.5 ? 2 - max - min : max + min)) * 100);
  };
  for (let y = 0; y < height; y += 8) for (let x = 0; x < width; x += 4) if (x < edge || x >= width - edge || y < edge) push(x, y);
  const median = list => list.sort((a, b) => a - b)[Math.floor(list.length / 2)] ?? 0;
  return { lightness: Math.round(median(ls)), saturation: Math.round(median(ss)) };
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
    const assets = await resolveAssets(store, browser, log);
    for (const deviceId of devices) {
      const device = store.device(deviceId);
      for (const locale of locales) {
        mkdirSync(store.paths.build, { recursive: true });
        const pageFile = join(store.paths.build, `${deviceId}-${locale}.html`);
        writeFileSync(pageFile, buildPage(store, device, locale, log, assets));

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
        const files = [], clip = i => ({ clip: { x: i * device.width, y: 0, width: device.width, height: device.height }, type: 'png' });
        const fulls = [];
        // Chrome can hand back a slide before every tile of a wide strip is painted (patches
        // of the page colour, half a line of text): shoot until two shots agree.
        const steady = async i => {
          let last = await page.screenshot(clip(i));
          for (let n = 0; n < 4; n++) {
            const next = await page.screenshot(clip(i));
            if (next.equals(last)) break;
            last = next;
          }
          return last;
        };
        for (const [i, slide] of report.slides.entries()) {
          const buf = flatten(await steady(i));
          fulls.push(buf);
          if (onlySlides && !onlySlides.includes(slide.id)) continue;
          const name = `${String(i + 1).padStart(2, '0')}-${slide.id}.png`;
          writeFileSync(join(outDir, name), buf);
          files.push(name);
        }
        // Three more passes per slide, for what the DOM can't tell: the slide with invisible text
        // (what is really behind each text), the text in magenta where it stands (which of its
        // pixels show) and the text alone in black on white (where its glyphs are). Contrast
        // and hidden letters come from comparing them.
        const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        const bareStyle = await page.addStyleTag({ content: '[data-text], [data-text] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; } [data-clip-text] { background: none !important; }' });
        await settle();
        const bares = [];
        for (const i of report.slides.keys()) bares.push(report.texts.some(t => t.slide === report.slides[i].id) ? decodePng(await page.screenshot(clip(i))) : null);
        await bareStyle.evaluate(el => el.remove());
        const probeStyle = await page.addStyleTag({ content: '[data-text], [data-text] * { color: #f0f !important; -webkit-text-fill-color: #f0f !important; text-shadow: none !important; } [data-clip-text] { background: none !important; }' });
        await settle();
        const probes = [];
        for (const i of report.slides.keys()) probes.push(bares[i] ? decodePng(await page.screenshot(clip(i))) : null);
        await probeStyle.evaluate(el => el.remove());
        await page.addStyleTag({ content: `html, body { background: #fff !important; background-image: none !important; }
          body * { visibility: hidden !important; }
          [data-text], [data-text] * { visibility: visible !important; color: #000 !important; -webkit-text-fill-color: #000 !important; background: none !important;
            text-shadow: none !important; box-shadow: none !important; border-color: transparent !important; outline: none !important; filter: none !important; mix-blend-mode: normal !important; opacity: 1 !important; }` });
        await settle();
        for (const [i, slide] of report.slides.entries()) {
          const texts = report.texts.filter(t => t.slide === slide.id), full = decodePng(fulls[i]);
          slide.emptyBand = emptyBand(full);
          slide.ground = groundOf(full);
          if (!texts.length) continue;
          const mask = decodePng(await page.screenshot(clip(i)));
          measureContrast(full, bares[i], mask, probes[i], texts);
          measureOcclusion(probes[i], bares[i], mask, texts);
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
