// Cut-outs: the subject of a photo (a person, a hand holding something, an object) without its
// background, to stand beside or behind the phones. The cut runs on this machine with rembg
// (`uv tool install "rembg[cpu,cli]"`; STORESHOTS_REMBG names another command that takes
// rembg's arguments), so no photo is uploaded anywhere.
//
//   storeshots cutout <asset> [--id name] [--crop x,y,w,h] [--model isnet-general-use]
//
// <asset> is an id in store/assets.json (a `stock --get` photo) or an image file. --crop keeps a
// part of the photo first (in its pixels). The cut-out goes to design/cutouts/<id>.png, cropped
// to the subject, and into assets.json with role "cutout" and the photo's credit.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { appRootOf, trim } from './assets.mjs';
import { CliError, EXIT, envError, usage } from './errors.mjs';

const LONG_SIDE = 2400; // a cut-out is shown at most about a slide wide (1320 px)
const HAZE = 32; // rembg leaves a faint veil (alpha under about 32) around the subject
const INSTALL = 'uv tool install "rembg[cpu,cli]" (or pipx install "rembg[cpu,cli]"), or set STORESHOTS_REMBG';

export const rembgCommand = (env = process.env) => env.STORESHOTS_REMBG || 'rembg';

export function hasRembg(env = process.env) {
  try { execFileSync(rembgCommand(env), ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

/** `storeshots cutout`: cut a photo's subject out and register it as an asset. */
export function cutout(store, { source, id, crop, model = 'isnet-general-use', log = console.error, run = execFileSync } = {}) {
  if (!source) throw usage('which photo?', { fix: 'storeshots cutout <asset id or image file> [--id name]' });
  const assetsFile = join(store.dir, 'assets.json');
  const doc = existsSync(assetsFile) ? JSON.parse(readFileSync(assetsFile, 'utf8')) : { assets: [] };
  doc.assets ??= [];
  const from = doc.assets.find(a => a.id === source);
  if (from && !from.file) throw usage(`asset "${source}" has no image file`, { fix: 'cut a photo: a `storeshots stock --get` download or an image file' });
  const path = from ? (from.file.startsWith('store/') ? resolve(store.dir, from.file.slice(6)) : resolve(appRootOf(store), from.file)) : resolve(source);
  if (!existsSync(path)) throw usage(`no photo at ${path}`, { fix: 'give an asset id from store/assets.json or an image file' });
  const box = crop ? String(crop).split(',').map(Number) : null;
  if (box && (box.length !== 4 || box.some(v => !Number.isFinite(v) || v < 0))) throw usage('--crop takes x,y,w,h in the photo\'s pixels', { fix: 'e.g. --crop 400,200,1600,2400' });

  const tmp = mkdtempSync(join(tmpdir(), 'storeshots-cutout-')), input = join(tmp, 'in.png'), cut = join(tmp, 'cut.png');
  try {
    const vf = [box && `crop=${box[2]}:${box[3]}:${box[0]}:${box[1]}`, `scale='min(${LONG_SIDE},iw)':'min(${LONG_SIDE},ih)':force_original_aspect_ratio=decrease`].filter(Boolean).join(',');
    run('ffmpeg', ['-loglevel', 'error', '-y', '-i', path, '-vf', vf, '-frames:v', '1', input], { stdio: ['ignore', 'ignore', 'pipe'] });
    try {
      run(rembgCommand(), ['i', '-m', model, input, cut], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
      if (e.code === 'ENOENT') throw envError('rembg is not installed', { fix: INSTALL });
      throw new CliError(`rembg failed: ${String(e.stderr ?? e.message).trim().split('\n').pop()}`, { exit: EXIT.RUN, fix: `try another model: --model birefnet-general-lite, or ${INSTALL}` });
    }
    const name = id ?? `${from?.id ?? basename(path, extname(path))}-cut`;
    const rel = `design/cutouts/${name}.png`;
    mkdirSync(join(store.dir, 'design', 'cutouts'), { recursive: true });
    writeFileSync(join(store.dir, rel), trim(readFileSync(cut), { haze: HAZE }));
    doc.assets = doc.assets.filter(a => a.id !== name);
    doc.assets.push({ id: name, file: `store/${rel}`, role: 'cutout', ...(from?.alt && { alt: from.alt }), ...(from?.credit && { credit: from.credit }), ...(from && { from: from.id }) });
    writeFileSync(assetsFile, JSON.stringify(doc, null, 2) + '\n');
    log(`cut ${rel} out of ${from ? `asset "${from.id}"` : path}`);
    return { asset: name, file: join(store.dir, rel), next: `place it: slides[].art {"asset": "${name}", "place": "float", "at": [x, y], "size": 70}, and look at its edge on the slide` };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
