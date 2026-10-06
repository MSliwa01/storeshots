// `storeshots init`: scaffolds <app>/store/ from a style, pre-filled with what
// brand.mjs finds in the repo (name, bundle id, icon, accent colour).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { detectBrand } from './brand.mjs';
import { device as deviceSpec } from './devices.mjs';
import { usage } from './errors.mjs';
import { buildDesign, copyStyleFonts, lookOf, slidesOf, styles } from './styles.mjs';


const DEFAULT_SHOTS = ['hero', 'feature-1', 'feature-2', 'feature-3', 'feature-4'];

export function init(appRootArg, { style = 'clean', locale = 'en', deviceId = 'iphone-6.9', shots = DEFAULT_SHOTS, force = false, log = console.error } = {}) {
  style ??= 'clean'; locale ??= 'en'; deviceId ??= 'iphone-6.9'; shots ??= DEFAULT_SHOTS;
  const appRoot = resolve(appRootArg ?? '.');
  const store = join(appRoot, 'store');
  if (!styles().includes(style)) throw usage(`unknown style "${style}"`, { fix: `styles: ${styles().join(', ')}` });
  if (existsSync(join(store, 'screenshots.json')) && !force) {
    throw usage(`${relative(process.cwd(), store) || 'store'}/screenshots.json already exists`, { fix: 'edit it, or pass --force to overwrite the scaffold' });
  }
  deviceSpec(deviceId);
  const brand = detectBrand(appRoot);
  const accent = brand.accent ?? '#3b82f6';

  mkdirSync(join(store, 'copy'), { recursive: true });

  const config = {
    app: { name: brand.name ?? 'My App', bundleId: brand.bundleId, icon: brand.icon ? join('..', brand.icon) : null, accent, ascAppId: null },
    locales: [locale],
    // "generic" is a drawn frame that works offline; `storeshots frames` installs Apple's
    // bezels, then "frame": "iphone-18-pro-max/black".
    devices: { [deviceId]: { frame: 'generic/black' } },
    capture: { bundleId: brand.bundleId, appearance: 'light', wait: 5, args: { DemoMode: 'YES' } },
    shots: Object.fromEntries(shots.map(id => [id, { args: { DemoScreen: id } }])),
    slides: shots.map(id => ({ id, shot: id })),
    look: { style },
  };
  writeFileSync(join(store, 'screenshots.json'), JSON.stringify(config, null, 2) + '\n');

  const copy = Object.fromEntries(shots.map((id, i) => [id, {
    title: i === 0 ? 'The main promise,\n*in your words*' : `Benefit ${i},\n*one idea*`,
    subtitle: i === 0 ? 'How the app delivers it' : 'The mechanism, one line',
  }]));
  // --force rebuilds the scaffold but never overwrites copy someone has written.
  const copyFile = join(store, 'copy', `${locale}.json`);
  if (!existsSync(copyFile)) writeFileSync(copyFile, JSON.stringify(copy, null, 2) + '\n');

  copyStyleFonts(style, join(store, 'design'));
  writeFileSync(join(store, 'design', `${style}.html`), buildDesign(style, { slides: slidesOf(config), accent, locale, look: lookOf(config, style), designDir: join(store, 'design'), screenHeight: deviceSpec(deviceId).height }));

  writeFileSync(join(store, '.gitignore'), 'output/\ndesign/.catalog/\n');
  if (!existsSync(join(store, 'brief.md'))) {
    writeFileSync(join(store, 'brief.md'), `# ${config.app.name}: store screenshots brief\n\n## Audience\n\n## Benefits (each tied to a real screen)\n\n## Slide story\n\n## Decisions\n`);
  }
  log(`created ${store} (style ${style}, brand ${accent}${brand.icon ? `, icon ${brand.icon}` : ''})`);
  return {
    store, style, brand, files: ['screenshots.json', `copy/${locale}.json`, `design/${style}.html`, 'brief.md'].map(f => join(store, f)),
    next: 'write copy/<locale>.json, then storeshots capture (or storeshots import <screenshots>), storeshots build',
  };
}
