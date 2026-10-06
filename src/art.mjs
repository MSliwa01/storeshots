// Generated art for a design: props, scenes and new mascot poses — never app UI.
// Assets are declared in <store>/art.json:
//   { "model": "openai/gpt-image-2",
//     "assets": [{ "id": "mascot-wave", "prompt": "…", "refs": ["design/art/mascot.png"],
//                  "size": "1024x1024", "transparent": true, "variants": 2 }] }
// Output: <store>/design/art/gen/<id>-v<N>.png plus <id>-v<N>.json (prompt, model, refs),
// so every image can be reproduced or regenerated. Optional: any OpenAI-compatible images
// API (OpenAI, Pollinations, …) via IMAGE_API_BASE (default https://gen.pollinations.ai/v1)
// and IMAGE_API_KEY or IMAGE_API_KEY_FILE. Never used for app UI.
// Transparent assets are generated on solid magenta and keyed out (models paint a fake
// checkerboard when asked for transparency).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { CliError, envError, EXIT, usage } from './errors.mjs';

const api = () => `${(process.env.IMAGE_API_BASE ?? 'https://gen.pollinations.ai/v1').replace(/\/$/, '')}/images`;
const CHROMA = 'Place the subject alone on a perfectly flat, solid pure magenta (#FF00FF) background: no shadow on the background, no gradient, no floor, no checkerboard, nothing else. Keep a clean edge between the subject and the background.';

export function imageApiKey(env = process.env) {
  if (env.IMAGE_API_KEY) return env.IMAGE_API_KEY.trim();
  const file = env.IMAGE_API_KEY_FILE?.replace(/^~/, homedir());
  if (file && existsSync(file)) return readFileSync(file, 'utf8').trim().replace(/^.*[:=]\s*/, '');
  return null;
}

function token() {
  const key = imageApiKey();
  if (!key) throw envError('no image API key (art generation is optional)', { fix: 'export IMAGE_API_KEY (and IMAGE_API_BASE for a provider other than Pollinations)' });
  return key;
}

async function request(asset, model, store) {
  const prompt = asset.transparent ? `${asset.prompt}\n\n${CHROMA}` : asset.prompt;
  const size = asset.size ?? '1024x1024';
  const headers = { Authorization: `Bearer ${token()}` };
  let res;
  if (asset.refs?.length) {
    const form = new FormData();
    form.set('model', model); form.set('prompt', prompt); form.set('size', size);
    for (const ref of asset.refs) {
      const file = resolve(store.dir, ref);
      form.append('image', new Blob([readFileSync(file)], { type: 'image/png' }), basename(file));
    }
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

/** Magenta → alpha, with despill so no pink fringe stays on the edge. */
export function keyOut(input, output) {
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', input,
    // colorkey, then pull magenta spill (R and B above G) back to neutral on the edges
    '-vf', "colorkey=0xFF00FF:0.32:0.12,format=rgba,geq="
      + "r='if(gt(min(r(X,Y),b(X,Y)),g(X,Y)+6),g(X,Y)+(min(r(X,Y),b(X,Y))-g(X,Y))*0.1+max(r(X,Y)-b(X,Y),0),r(X,Y))':"
      + "g='g(X,Y)':"
      + "b='if(gt(min(r(X,Y),b(X,Y)),g(X,Y)+6),g(X,Y)+(min(r(X,Y),b(X,Y))-g(X,Y))*0.1+max(b(X,Y)-r(X,Y),0),b(X,Y))':"
      + "a='alpha(X,Y)'", output]);
}

export async function art(store, { only, variants: override, log = console.error }) {
  const file = join(store.dir, 'art.json');
  if (!existsSync(file)) throw usage(`no ${file}`, { fix: 'declare assets in store/art.json (see src/art.mjs for the format)' });
  const config = JSON.parse(readFileSync(file, 'utf8'));
  const outDir = join(store.dir, 'design/art/gen');
  mkdirSync(outDir, { recursive: true });
  const assets = config.assets.filter(a => !only || only.includes(a.id));
  const written = [];
  if (!assets.length) throw usage('no matching assets', { fix: `known: ${config.assets.map(a => a.id).join(', ')}` });
  for (const asset of assets) {
    const model = asset.model ?? config.model ?? 'openai/gpt-image-2';
    const count = override ?? asset.variants ?? 1;
    for (let n = 1; n <= count; n++) {
      let v = n;
      while (existsSync(join(outDir, `${asset.id}-v${v}.png`))) v++;
      const base = join(outDir, `${asset.id}-v${v}`);
      const started = Date.now();
      const buf = await request(asset, model, store);
      const raw = `${base}.raw`;
      writeFileSync(raw, buf);
      if (asset.transparent) keyOut(raw, `${base}.png`);
      else execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, `${base}.png`]);
      execFileSync('rm', ['-f', raw]);
      writeFileSync(`${base}.json`, JSON.stringify({ id: asset.id, model, prompt: asset.prompt, refs: asset.refs ?? [], size: asset.size ?? '1024x1024', transparent: !!asset.transparent, createdAt: new Date().toISOString() }, null, 2));
      written.push(`${base}.png`);
      log(`art ${asset.id}-v${v}.png (${model}, ${Math.round((Date.now() - started) / 1000)} s)`);
    }
  }
  return { dir: outDir, files: written };
}
