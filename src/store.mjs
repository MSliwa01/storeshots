// An app's screenshot project: <app repo>/store/screenshots.json plus copy/ and design/.
import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { device } from './devices.mjs';
import { usage } from './errors.mjs';

export function findStore(arg) {
  const candidates = arg ? [resolve(arg), resolve(arg, 'store')] : [resolve('store'), resolve('.')];
  const dir = candidates.find(d => existsSync(join(d, 'screenshots.json')));
  if (!dir) throw usage(`no screenshots.json in ${candidates.join(' or ')}`, { fix: 'run `storeshots init` in the app repo, or pass the store folder as the first argument' });
  return dir;
}

/**
 * `design` renders an alternative design file (e.g. one of several directions) into
 * output/variants/<name>/ instead of output/final and output/review.
 */
export function loadStore(dirArg, { design } = {}) {
  const dir = findStore(dirArg);
  const config = JSON.parse(readFileSync(join(dir, 'screenshots.json'), 'utf8'));
  const out = resolve(dir, config.paths?.output ?? 'output');
  const variantDesign = design ? resolve(dir, design) : null;
  const variant = variantDesign ? join(out, 'variants', basename(variantDesign, extname(variantDesign))) : null;
  return {
    dir,
    config,
    app: config.app ?? {},
    locales: config.locales ?? ['en'],
    devices: Object.keys(config.devices ?? {}),
    shots: config.shots ?? {},
    paths: {
      out,
      raw: resolve(dir, config.paths?.raw ?? join(out, 'raw')),
      final: variant ? join(variant, 'final') : join(out, 'final'),
      review: variant ? join(variant, 'review') : join(out, 'review'),
      build: join(out, '.build'),
    },
    /** Device spec merged with this project's per-device settings (design file, frame). */
    device(id) {
      const own = config.devices?.[id];
      if (!own) throw usage(`device "${id}" is not in screenshots.json`, { fix: `configured devices: ${Object.keys(config.devices ?? {}).join(', ')}` });
      // The design file: --design, then devices.<id>.design, then the current style's file.
      const style = config.look?.style ?? config.look?.world;
      const fallback = style ? `design/${style}.html` : `design/${id}.html`;
      return { ...device(id), ...own, design: variantDesign ?? resolve(dir, own.design ?? fallback) };
    },
    copy(locale) {
      const file = join(dir, 'copy', `${locale}.json`);
      return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    },
    rawShot(deviceId, locale, shot) {
      return join(this.paths.raw, deviceId, locale, `${shot}.png`);
    },
  };
}

/** --name a,b → ['a','b'] (or the fallback). */
export function listArg(args, name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1].split(',') : fallback;
}
