// Reads an app repo's identity so a new store/ project starts on-brand:
// name, bundle id, icon file and accent colour, from whichever stack is present
// (Xcode asset catalogs + Info.plist / project.yml, Expo app.json, Flutter pubspec,
// Android colors.xml). Everything is best effort; missing fields stay null.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { decodePng } from './png.mjs';

const SKIP = new Set(['node_modules', '.git', 'build', 'Pods', 'DerivedData', '.build', 'dist', '.expo', 'output', 'store']);

function walk(dir, depth = 0, out = []) {
  if (depth > 7) return out;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(p);
      walk(p, depth + 1, out);
    } else out.push(p);
  }
  return out;
}

const read = f => { try { return readFileSync(f, 'utf8'); } catch { return null; } };

/** sRGB components (0–1 floats, 0–255 ints or hex strings) → #rrggbb. */
function hexFromComponents(c) {
  const v = x => {
    const s = String(x);
    const n = s.startsWith('0x') ? parseInt(s, 16) : parseFloat(s);
    return Math.round(n <= 1 && !s.startsWith('0x') && !/^\d{2,3}$/.test(s) ? n * 255 : n);
  };
  return '#' + [c.red, c.green, c.blue].map(v).map(n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('');
}

export function detectBrand(appRoot) {
  const files = walk(appRoot);
  const brand = { name: null, bundleId: null, icon: null, accent: null, stack: [] };

  // Xcode asset catalogs.
  const iconSets = files.filter(f => f.endsWith('AppIcon.appiconset'));
  for (const set of iconSets) {
    const pngs = readdirSync(set).filter(f => f.endsWith('.png')).map(f => join(set, f));
    const biggest = pngs.sort((a, b) => statSync(b).size - statSync(a).size)[0];
    if (biggest && !brand.icon) brand.icon = biggest;
  }
  const accentSet = files.find(f => f.endsWith('AccentColor.colorset'));
  if (accentSet) {
    try {
      const json = JSON.parse(readFileSync(join(accentSet, 'Contents.json'), 'utf8'));
      const c = json.colors?.find(x => !x.appearances)?.color?.components ?? json.colors?.[0]?.color?.components;
      if (c) brand.accent = hexFromComponents(c);
    } catch { /* no explicit colour */ }
  }
  if (iconSets.length) brand.stack.push('ios');

  // Info.plist / project.yml.
  for (const plist of files.filter(f => f.endsWith('Info.plist'))) {
    const xml = read(plist) ?? '';
    const name = xml.match(/<key>CFBundleDisplayName<\/key>\s*<string>([^<$]+)<\/string>/)?.[1];
    if (name && !brand.name) brand.name = name;
  }
  for (const yml of files.filter(f => /project\.ya?ml$/.test(f))) {
    const text = read(yml) ?? '';
    brand.bundleId ??= text.match(/PRODUCT_BUNDLE_IDENTIFIER:\s*["']?([\w.-]+)/)?.[1] ?? null;
    brand.name ??= text.match(/CFBundleDisplayName:\s*["']?([^"'\n]+)/)?.[1]?.trim() ?? null;
  }
  for (const pbx of files.filter(f => f.endsWith('project.pbxproj'))) {
    brand.bundleId ??= (read(pbx) ?? '').match(/PRODUCT_BUNDLE_IDENTIFIER = "?([\w.-]+)"?;/)?.[1] ?? null;
  }

  // Expo / React Native.
  const appJson = files.find(f => /(^|\/)app\.json$/.test(f) && relative(appRoot, f).split('/').length <= 2);
  if (appJson) {
    try {
      const j = JSON.parse(readFileSync(appJson, 'utf8')), expo = j.expo ?? j;
      brand.stack.push('expo');
      brand.name ??= expo.name ?? null;
      brand.bundleId ??= expo.ios?.bundleIdentifier ?? null;
      brand.accent ??= expo.primaryColor ?? null;
      if (expo.icon && !brand.icon) brand.icon = join(appRoot, expo.icon);
    } catch { /* not an Expo config */ }
  }

  // Flutter.
  const pubspec = files.find(f => f.endsWith('pubspec.yaml'));
  if (pubspec) {
    brand.stack.push('flutter');
    brand.name ??= (read(pubspec) ?? '').match(/^name:\s*(\S+)/m)?.[1] ?? null;
  }

  // Android colours.
  const colors = files.find(f => f.endsWith('values/colors.xml'));
  if (colors) {
    brand.accent ??= (read(colors) ?? '').match(/name="(?:colorPrimary|primary|brand)[^"]*">\s*(#[0-9a-fA-F]{6,8})/)?.[1]?.slice(0, 7) ?? null;
    brand.stack.push('android');
  }

  if (brand.icon && !brand.accent) brand.accent = iconColour(brand.icon);
  if (brand.icon) brand.icon = relative(appRoot, brand.icon);
  return brand;
}

/** The icon's most common saturated colour (5-bit buckets), or null. */
export function iconColour(file) {
  let img;
  try { img = decodePng(readFileSync(file)); } catch { return null; }
  const counts = new Map();
  const step = Math.max(1, Math.floor(Math.sqrt((img.width * img.height) / 40000)));
  for (let y = 0; y < img.height; y += step) for (let x = 0; x < img.width; x += step) {
    const i = (y * img.width + x) * 4, [r, g, b, a] = img.rgba.subarray(i, i + 4);
    if (a < 200) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 40 || max - min < 50) continue; // skip near-black, grey and white
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (best === undefined) return null;
  const ch = shift => (((best >> shift) & 31) << 3) + 4;
  return '#' + [ch(10), ch(5), ch(0)].map(n => n.toString(16).padStart(2, '0')).join('');
}
