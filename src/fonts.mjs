// Fonts for captions, as one axis of the look (look.font): the style's own type, or a
// rounded face that reads well on a phone screen.
//   style       the style's own fonts (default)
//   sf-rounded  SF Pro Rounded: Apple's licence allows it for mock-ups of apps for its
//               platforms; downloaded per machine (`storeshots fonts --install sf`), never
//               committed or redistributed, like the bezels
//   sf          SF Pro Display, the same way
//   nunito      Nunito (OFL, bundled)
//   fredoka     Fredoka (OFL, bundled): rounder, playful
//   { "file": "<path in the app repo>", "family"?: name }   the app's own font
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CliError, EXIT, usage } from './errors.mjs';
import { DATA_DIR, KIT_DIR } from './paths.mjs';

export const LOCAL_FONTS = join(DATA_DIR, 'fonts');
const SF_DMG = 'https://devimages-cdn.apple.com/design/resources/download/SF-Pro.dmg';
const WEIGHTS = { Ultralight: 100, Thin: 200, Light: 300, Regular: 400, Medium: 500, Semibold: 600, Bold: 700, Heavy: 800, Black: 900 };
const APPLE = { 'sf-rounded': { family: 'SF Pro Rounded', prefix: 'SF-Pro-Rounded-' }, sf: { family: 'SF Pro Display', prefix: 'SF-Pro-Display-' } };
const BUNDLED = { nunito: { family: 'Nunito', file: 'Nunito.ttf', weight: '200 1000' }, fredoka: { family: 'Fredoka', file: 'Fredoka.ttf', weight: '300 700' } };
export const FONTS = ['style', 'sf-rounded', 'nunito', 'fredoka', 'sf'];

const appleFiles = name => (existsSync(LOCAL_FONTS) ? readdirSync(LOCAL_FONTS) : []).filter(f => f.startsWith(APPLE[name].prefix) && /\.otf$/.test(f) && !/Italic/.test(f));

/** Which font options this machine has. */
export function fontOptions() {
  return FONTS.map(name => ({ name, available: name === 'style' || !!BUNDLED[name] || appleFiles(name).length > 0 }));
}

/** `storeshots fonts --install sf`: SF Pro (Display and Rounded) from Apple's DMG into the local font folder. */
export function installAppleFonts(log = console.error) {
  const dl = join(LOCAL_FONTS, '_dl'), dmg = join(dl, 'SF-Pro.dmg');
  mkdirSync(dl, { recursive: true });
  if (!existsSync(dmg)) {
    log(`downloading SF-Pro.dmg from Apple Design Resources (about 220 MB).\nApple's licence: for mock-ups of user interfaces of apps for Apple platforms; kept on this machine, never redistributed.`);
    execFileSync('curl', ['-sSfL', '-o', dmg, SF_DMG], { stdio: 'inherit' });
  }
  try {
    execFileSync('7z', ['e', '-y', `-o${dl}`, dmg, 'SFProFonts.pkg'], { stdio: 'ignore' });
    execFileSync('7z', ['e', '-y', `-o${dl}`, join(dl, 'SFProFonts.pkg'), 'Payload~'], { stdio: 'ignore' });
    execFileSync('7z', ['e', '-y', `-o${LOCAL_FONTS}`, join(dl, 'Payload~'), '-r', 'SF-Pro-Rounded-*.otf', 'SF-Pro-Display-*.otf'], { stdio: 'ignore' });
  } catch (e) {
    throw new CliError('could not unpack SF-Pro.dmg', { exit: EXIT.ENV, detail: e.message, fix: 'install 7-Zip (p7zip-full / 7zz), then rerun `storeshots fonts --install sf`' });
  } finally {
    rmSync(join(dl, 'SFProFonts.pkg'), { force: true });
    rmSync(join(dl, 'Payload~'), { force: true });
  }
  return { installed: Object.keys(APPLE).map(name => ({ name, files: appleFiles(name).length })), dir: LOCAL_FONTS };
}

/**
 * CSS that sets every caption in the chosen font, placed after the style's own rules.
 * Bundled fonts are copied next to the design; Apple's are linked from this machine's font
 * folder (never copied into a repo); the app's own font is linked from the app repo.
 */
export function fontCSS(font, { designDir, appRoot } = {}) {
  if (!font || font === 'style') return '';
  let faces = '', family;
  if (typeof font === 'object' && font.file) {
    const file = resolve(appRoot ?? '.', font.file);
    if (!existsSync(file)) throw usage(`font file not found: ${file}`, { fix: 'look.font.file is relative to the app repo (app.root)' });
    family = font.family ?? basename(file).replace(/[-_]?(Regular|Medium|SemiBold|Bold|Black|Light)?\.(ttf|otf)$/i, '');
    faces = `@font-face { font-family: "${family}"; src: url("${pathToFileURL(file).href}"); font-weight: ${font.weight ?? '100 900'}; }`;
  } else if (BUNDLED[font]) {
    const f = BUNDLED[font];
    family = f.family;
    if (designDir) {
      mkdirSync(join(designDir, 'fonts'), { recursive: true });
      copyFileSync(join(KIT_DIR, 'fonts', f.file), join(designDir, 'fonts', f.file));
      if (existsSync(join(KIT_DIR, 'fonts', `OFL-${f.family}.txt`))) copyFileSync(join(KIT_DIR, 'fonts', `OFL-${f.family}.txt`), join(designDir, 'fonts', `OFL-${f.family}.txt`));
    }
    faces = `@font-face { font-family: "${family}"; src: url(fonts/${f.file}); font-weight: ${f.weight}; }`;
  } else if (APPLE[font]) {
    const files = appleFiles(font);
    if (!files.length) throw usage(`${APPLE[font].family} is not installed on this machine`, { fix: 'storeshots fonts --install sf (downloads it from Apple once)' });
    family = APPLE[font].family;
    faces = files.map(f => `@font-face { font-family: "${family}"; src: url("${pathToFileURL(join(LOCAL_FONTS, f)).href}"); font-weight: ${WEIGHTS[f.slice(APPLE[font].prefix.length, -4)] ?? 400}; }`).join('\n');
  } else throw usage(`unknown font "${font}"`, { fix: `fonts: ${FONTS.join(', ')}, or {"file": "<path in the app repo>"}` });
  return `<style data-look-font>
${faces}
body, .slide h1, .slide p, [data-text], [data-text] em { font-family: "${family}", system-ui, sans-serif !important; font-variation-settings: normal !important; }
.slide h1 { letter-spacing: -.012em !important; }
</style>`;
}
