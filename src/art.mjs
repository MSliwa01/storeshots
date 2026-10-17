// Generated art for a design: new poses of the app's own character, props and scenes; never app UI.
// Assets are declared in <store>/art.json:
//   { "provider"?: "codex" | "api", "model"?: "openai/gpt-image-2",
//     "assets": [{ "id": "sheep-wave", "kind"?: "pose" | "prop" | "scene",
//                  "prompt": "waving hello, one front hoof raised above its head",
//                  "refs": ["design/art/sheep.svg"], "size": "1024x1024", "transparent": true,
//                  "variants": 2, "style"?: "…", "shown"?: 400 }] }
// prompt says only what is new (the pose, the object, the scene). artPrompt() wraps it in a
// spec: what the image is for, which input image is what, what must stay as in the refs,
// framing, background and what to avoid. kind: pose (a new pose of the character in refs),
// prop (one object; refs only lend their style) or scene (a backdrop). Without refs it
// defaults to prop when transparent, else scene; with refs it must be given.
// Output: <store>/design/art/gen/<id>-v<N>.png plus <id>-v<N>.json (the full prompt, provider,
// refs), so every image can be reproduced or regenerated.
// Providers: "codex" runs `codex exec` and its built-in image tool (a ChatGPT login, no API
// key); "api" calls any OpenAI-compatible images API via IMAGE_API_BASE (default
// https://gen.pollinations.ai/v1) with IMAGE_API_KEY or IMAGE_API_KEY_FILE. Without a
// provider set, an API key wins, then codex.
// Transparent assets are generated on solid magenta (green when the subject is pink or purple)
// and keyed out (models paint a fake
// checkerboard when asked for transparency).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { webSafe } from './assets.mjs';
import { launchBrowser } from './browser.mjs';
import { CliError, envError, EXIT, usage } from './errors.mjs';
import { decodePng } from './png.mjs';

const api = () => `${(process.env.IMAGE_API_BASE ?? 'https://gen.pollinations.ai/v1').replace(/\/$/, '')}/images`;
const KEYS = { magenta: '#FF00FF', green: '#00FF00' };
const chroma = key => `the subject alone on a perfectly flat, solid pure ${key} (${KEYS[key]}) background: no shadow on the background, no gradient, no floor, no checkerboard, nothing else. Keep a clean edge between the subject and the background, and no ${key} inside the subject.`;
/** The key colour: magenta, unless the subject itself is pink or purple (keying would eat it). */
export const keyOf = asset => asset.key ?? (/\b(pink|purple|magenta|violet|lilac|fuchsia|lavender|mauve)/i.test(`${asset.prompt} ${asset.style ?? ''}`) ? 'green' : 'magenta');

export function imageApiKey(env = process.env) {
  if (env.IMAGE_API_KEY) return env.IMAGE_API_KEY.trim();
  const file = env.IMAGE_API_KEY_FILE?.replace(/^~/, homedir());
  if (file && existsSync(file)) return readFileSync(file, 'utf8').trim().replace(/^.*[:=]\s*/, '');
  return null;
}

/** Codex CLI logged in (`codex login status` exits 0), or null. */
export function codexLogin() {
  try { return execFileSync('codex', ['login', 'status'], { input: '', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 }).trim().split('\n')[0] || 'logged in'; } catch { return null; }
}

/** Which provider `art` uses: art.json or IMAGE_PROVIDER, else an API key, else codex. */
export function imageProvider(config = {}, env = process.env, codex = codexLogin) {
  const want = env.IMAGE_PROVIDER ?? config.provider;
  if (want) {
    if (!['codex', 'api'].includes(want)) throw usage(`unknown image provider "${want}"`, { fix: 'use "codex" or "api"' });
    return want;
  }
  if (imageApiKey(env)) return 'api';
  if (codex()) return 'codex';
  throw envError('no image provider (art generation is optional)', { fix: 'log in to the Codex CLI with ChatGPT (`codex login`), or export IMAGE_API_KEY (and IMAGE_API_BASE for a provider other than Pollinations)' });
}

const KINDS = ['pose', 'prop', 'scene'];
// With refs the kind can't be guessed (a mascot to keep, or art to borrow the style from).
const kindOf = a => a.kind ?? (a.refs?.length ? null : a.transparent ? 'prop' : 'scene');

function canvas(size = '1024x1024') {
  const [w, h] = size.split('x').map(Number);
  if (!w || !h || Math.abs(w - h) < w * 0.05) return 'square';
  return w > h ? `landscape, ${w}:${h} (wider than tall)` : `portrait, ${w}:${h} (taller than wide)`;
}

/** The full prompt sent for an asset: a short labelled spec around the asset's own prompt. */
export function artPrompt(asset) {
  const kind = kindOf(asset), refs = asset.refs?.length ?? 0, shown = asset.shown ?? (kind === 'scene' ? null : 400);
  const images = refs === 1 ? 'Image 1' : `Images 1–${refs}`;
  const lines = [];
  if (kind === 'pose') {
    lines.push(`Asset: a new pose of an app's own character, beside or behind a phone in an App Store screenshot, shown about ${shown} px tall.`);
    if (refs) lines.push(`Input images: ${images} ${refs === 1 ? 'shows the character. It is' : 'show the character. They are'} the only source for how it looks.`);
    lines.push(`Request: the same character${refs ? ' as in Image 1' : ''}, ${asset.prompt}.`);
    lines.push(`Style: ${asset.style ?? (refs ? 'exactly as in Image 1: the same rendering (flat, painted or 3D), line weight, palette and proportions' : 'clean, friendly character illustration')}.`);
    if (refs) lines.push('Keep: the character identical to the reference (head and body shape, face, eyes, mouth style, ears, colours, markings, outline). Change only the pose and expression.');
    lines.push('Pose: it must read in silhouette at small size, so raised limbs and anything held stand clear of the body outline.');
    lines.push('Framing: full body, centred, about 80 % of the image height, nothing cropped.');
  } else if (kind === 'prop') {
    lines.push(`Asset: one object beside or behind a phone in an App Store screenshot, shown about ${shown} px wide. It has to look like part of the app's own art, not pasted on.`);
    if (refs) lines.push(`Input images: ${images} ${refs === 1 ? 'is' : 'are'} the app's own art, a reference for style only. Do not copy ${refs === 1 ? 'its' : 'their'} subject.`);
    lines.push(`Request: ${asset.prompt}.`);
    lines.push(`Style: ${asset.style ?? (refs ? `the same rendering, line weight and palette as ${images}. No gloss, highlights, gradients or outlines that ${images} ${refs === 1 ? "doesn't" : "don't"} have` : 'clean flat illustration with simple shapes, no gloss or gradients')}.`);
    lines.push('Framing: the whole object, centred, about 75 % of the image, nothing cropped, a simple shape that reads at small size.');
  } else {
    lines.push('Asset: a backdrop behind phones and headlines in an App Store screenshot.');
    if (refs) lines.push(`Input images: ${images} ${refs === 1 ? 'is' : 'are'} the app's own art or scenery, a reference for style and palette.`);
    lines.push(`Request: ${asset.prompt}.`);
    if (asset.style || refs) lines.push(`Style: ${asset.style ?? `the same rendering and palette as ${images}, no effects ${images} ${refs === 1 ? "doesn't" : "don't"} have`}.`);
    lines.push('Composition: calm, low-detail areas in the top third (headline) and the centre (phone); detail at the edges and the bottom.');
  }
  lines.push(`Canvas: ${canvas(asset.size)}.`);
  if (asset.transparent) lines.push(`Background: ${chroma(keyOf(asset))}`);
  lines.push(`Avoid: text, letters, numbers, logos, watermark, phones or app screens${kind === 'scene' ? ', people or characters unless asked' : `, extra characters, objects not asked for, cast shadows${kind === 'prop' ? ', a white sticker border' : ''}`}.`);
  return lines.join('\n');
}

/** SVG references → PNG on white (image models read raster only), into dir. A ref that
 *  doesn't draw fails here: a blank reference makes the model ignore the style. */
export async function rasterRefs(refs, store, dir) {
  const files = refs.map(r => resolve(store.dir, r));
  for (const f of files) if (!existsSync(f)) throw usage(`missing ref ${f}`);
  if (!files.some(f => extname(f).toLowerCase() === '.svg')) return files;
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
    const out = [];
    for (const [i, f] of files.entries()) {
      if (extname(f).toLowerCase() !== '.svg') { out.push(f); continue; }
      const svg = readFileSync(webSafe(f, dir)).toString('base64');
      await page.setContent(`<body style="margin:0;background:#fff"><img src="data:image/svg+xml;base64,${svg}" style="width:1024px;height:1024px;object-fit:contain"></body>`);
      const ok = await page.$eval('img', img => img.decode().then(() => img.naturalWidth > 0, () => false));
      if (!ok) throw usage(`ref ${f} does not draw in a browser`, { fix: 'open it in Chrome; export a PNG of it and use that as the ref' });
      const png = join(dir, `ref-${i + 1}-${basename(f, '.svg')}.png`);
      await page.screenshot({ path: png });
      out.push(png);
    }
    return out;
  } finally { await browser.close(); }
}

async function viaApi(prompt, refs, asset, model) {
  const size = asset.size ?? '1024x1024';
  const key = imageApiKey();
  if (!key) throw envError('no image API key', { fix: 'export IMAGE_API_KEY, or use "provider": "codex"' });
  const headers = { Authorization: `Bearer ${key}` };
  let res;
  if (refs.length) {
    const form = new FormData();
    form.set('model', model); form.set('prompt', prompt); form.set('size', size);
    for (const ref of refs) form.append('image', new Blob([readFileSync(ref)], { type: 'image/png' }), basename(ref));
    res = await fetch(`${api()}/edits`, { method: 'POST', headers, body: form });
  } else {
    res = await fetch(`${api()}/generations`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt, size }) });
  }
  const text = await res.text();
  if (!res.ok) throw new CliError(`${asset.id}: image API ${res.status}`, { exit: EXIT.RUN, detail: text.slice(0, 300), fix: res.status === 402 ? 'out of credits: wait for the daily refill or use a cheaper model in art.json' : undefined });
  const item = JSON.parse(text).data?.[0];
  if (!item?.b64_json) throw new CliError(`${asset.id}: no image in response`, { exit: EXIT.RUN });
  return Buffer.from(item.b64_json, 'base64');
}

/** The message of Codex's last error event (`error` or `turn.failed`) in its --json output, if any. */
export function codexError(out) {
  const events = out.split('\n').filter(l => l.startsWith('{')).map(l => { try { return JSON.parse(l); } catch { return {}; } });
  const last = events.filter(e => e.type === 'error' || e.type === 'turn.failed').pop();
  return last ? (last.message ?? last.error?.message ?? null) : null;
}

/** One image through Codex's built-in image tool; the file lands in $CODEX_HOME/generated_images/<thread>/. */
function viaCodex(prompt, refs, asset, workDir) {
  const instruction = `Call the image_gen tool exactly once. Pass it the prompt below verbatim${refs.length ? `, with the attached image${refs.length > 1 ? 's in order as Image 1, Image 2 and so on' : ' as Image 1'}` : ''}. Do not run shell commands, do not read or write files, and do not change the prompt. When the image is done, reply only with DONE.\n\n${prompt}`;
  const args = ['exec', ...refs.flatMap(r => ['-i', r]), '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-C', workDir, '--json', '-c', 'model_reasoning_effort="low"'];
  if (process.env.STORESHOTS_CODEX_MODEL) args.push('-m', process.env.STORESHOTS_CODEX_MODEL);
  let out;
  try {
    out = execFileSync('codex', args, { input: instruction, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 6 * 60000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    // Codex reports its own failures (a usage limit, a refused prompt) as JSON events on stdout.
    const failed = codexError(String(e.stdout ?? ''));
    const limit = /usage limit|try again at/i.test(failed ?? '');
    throw new CliError(`${asset.id}: ${failed ? `codex: ${failed}` : 'codex exec failed'}`, { exit: EXIT.RUN, detail: failed ? undefined : String(e.stderr || e.message).slice(-400),
      fix: limit ? 'the ChatGPT plan\'s image use is spent: wait until the time Codex names, then run `storeshots art` again (finished assets are kept)' : 'check `codex login status`; image generation needs a ChatGPT plan with image use left' });
  }
  const events = out.split('\n').filter(l => l.startsWith('{')).map(l => { try { return JSON.parse(l); } catch { return {}; } });
  const thread = events.find(e => e.type === 'thread.started')?.thread_id;
  const said = events.filter(e => e.item?.type === 'agent_message').map(e => e.item.text).join(' ');
  const dir = thread && join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'generated_images', thread);
  const pngs = dir && existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.png')).map(f => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs) : [];
  if (!pngs.length) throw new CliError(`${asset.id}: codex made no image`, { exit: EXIT.RUN, detail: said.slice(0, 400) || out.slice(-400) });
  return readFileSync(pngs[0]);
}

/** Where the subject touches the edge of a keyed image (a cropped sticker), as a list of sides. */
export function croppedSides(file) {
  const { width, height, rgba } = decodePng(readFileSync(file));
  const solid = (x, y) => rgba[(y * width + x) * 4 + 3] > 128;
  const row = y => { let n = 0; for (let x = 0; x < width; x++) n += solid(x, y); return n; };
  const col = x => { let n = 0; for (let y = 0; y < height; y++) n += solid(x, y); return n; };
  const min = Math.max(3, Math.round(Math.min(width, height) * 0.01));
  return [['top', row(0)], ['bottom', row(height - 1)], ['left', col(0)], ['right', col(width - 1)]].filter(([, n]) => n >= min).map(([s]) => s);
}

/** Key colour → alpha, with despill so no coloured fringe stays on the edge. */
export function keyOut(input, output, key = 'magenta') {
  // colorkey, then pull the key's spill back to neutral on the edges: magenta is R and B above G,
  // green is G above R and B.
  const despill = key === 'green'
    ? "r='r(X,Y)':g='if(gt(g(X,Y),max(r(X,Y),b(X,Y))+6),max(r(X,Y),b(X,Y))+(g(X,Y)-max(r(X,Y),b(X,Y)))*0.1,g(X,Y))':b='b(X,Y)'"
    : "r='if(gt(min(r(X,Y),b(X,Y)),g(X,Y)+6),g(X,Y)+(min(r(X,Y),b(X,Y))-g(X,Y))*0.1+max(r(X,Y)-b(X,Y),0),r(X,Y))':"
      + "g='g(X,Y)':"
      + "b='if(gt(min(r(X,Y),b(X,Y)),g(X,Y)+6),g(X,Y)+(min(r(X,Y),b(X,Y))-g(X,Y))*0.1+max(b(X,Y)-r(X,Y),0),b(X,Y))'";
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', input,
    '-vf', `colorkey=0x${KEYS[key].slice(1)}:0.32:0.12,format=rgba,geq=${despill}:a='alpha(X,Y)'`, '-frames:v', '1', output]);
}

export async function art(store, { only, variants: override, dryRun = false, log = console.error }) {
  const file = join(store.dir, 'art.json');
  if (!existsSync(file)) throw usage(`no ${file}`, { fix: 'declare assets in store/art.json (see src/art.mjs for the format)' });
  const config = JSON.parse(readFileSync(file, 'utf8'));
  const assets = config.assets.filter(a => !only || only.includes(a.id));
  if (!assets.length) throw usage('no matching assets', { fix: `known: ${config.assets.map(a => a.id).join(', ')}` });
  for (const a of assets) {
    if (!a.id || !a.prompt) throw usage(`art.json: every asset needs an id and a prompt${a.id ? ` (${a.id})` : ''}`);
    if (!KINDS.includes(kindOf(a))) throw usage(`art.json: ${a.id} needs "kind": ${KINDS.map(k => `"${k}"`).join(', ')}`, { fix: 'pose keeps the character in refs and changes its pose; prop and scene borrow only the style of refs' });
  }
  if (dryRun) {
    for (const a of assets) log(`── ${a.id} (${kindOf(a)}${a.refs?.length ? `, refs: ${a.refs.join(', ')}` : ''})\n${artPrompt(a)}\n`);
    return { dir: null, files: [], prompts: Object.fromEntries(assets.map(a => [a.id, artPrompt(a)])) };
  }
  const provider = imageProvider(config);
  const outDir = join(store.dir, 'design/art/gen');
  mkdirSync(outDir, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), 'storeshots-art-'));
  const written = [];
  try {
    for (const asset of assets) {
      const model = provider === 'codex' ? 'codex image_gen' : asset.model ?? config.model ?? 'openai/gpt-image-2';
      const prompt = artPrompt(asset);
      const refs = asset.refs?.length ? await rasterRefs(asset.refs, store, work) : [];
      const count = override ?? asset.variants ?? 1;
      for (let n = 1; n <= count; n++) {
        let v = n;
        while (existsSync(join(outDir, `${asset.id}-v${v}.png`))) v++;
        const base = join(outDir, `${asset.id}-v${v}`);
        const started = Date.now();
        const buf = provider === 'codex' ? viaCodex(prompt, refs, asset, work) : await viaApi(prompt, refs, asset, model);
        const raw = `${base}.raw`;
        writeFileSync(raw, buf);
        if (asset.transparent) keyOut(raw, `${base}.png`, keyOf(asset));
        else execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, '-frames:v', '1', `${base}.png`]);
        rmSync(raw, { force: true });
        writeFileSync(`${base}.json`, JSON.stringify({ id: asset.id, kind: kindOf(asset), provider, model, prompt: asset.prompt, sent: prompt, refs: asset.refs ?? [], size: asset.size ?? '1024x1024', transparent: !!asset.transparent, key: asset.transparent ? keyOf(asset) : undefined, createdAt: new Date().toISOString() }, null, 2));
        written.push(`${base}.png`);
        const cut = asset.transparent ? croppedSides(`${base}.png`) : [];
        log(`art ${asset.id}-v${v}.png (${model}, ${Math.round((Date.now() - started) / 1000)} s)${cut.length ? `  warn: the subject touches the ${cut.join(' and ')} edge (cropped?)` : ''}`);
      }
    }
  } finally { rmSync(work, { recursive: true, force: true }); }
  return { dir: outDir, files: written };
}
