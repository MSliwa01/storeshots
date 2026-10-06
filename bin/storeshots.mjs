#!/usr/bin/env node
// storeshots — App Store screenshots from your real app: capture, compose, check, upload.
import { art } from '../src/art.mjs';
import { capture } from '../src/capture.mjs';
import { AXES, catalog } from '../src/catalog.mjs';
import { check } from '../src/check.mjs';
import { doctor } from '../src/doctor.mjs';
import { elements } from '../src/elements.mjs';
import { CliError, EXIT, usage } from '../src/errors.mjs';
import { installFrames } from '../src/frames.mjs';
import { init } from '../src/init.mjs';
import { styles, writeStyle } from '../src/styles.mjs';
import { board, CURATED, lookup, saveApp, search, topChart } from '../src/refs.mjs';
import { proof } from '../src/proof.mjs';
import { render } from '../src/render.mjs';
import { review } from '../src/review.mjs';
import { loadStore } from '../src/store.mjs';
import { importShots } from '../src/import.mjs';
import { skill } from '../src/skill.mjs';
import { upload } from '../src/upload.mjs';

const HELP = `storeshots <command> [store] [options]

Set up
  init [app]         create <app>/store/ (screenshots.json, copy, design) from the app's name, icon and colour
                     --style ${styles().join('|')}  --shots hero,feature-1  --locale en  --device iphone-6.9  --force
  doctor             check node, ffmpeg, the browser, frames, the simulator host and credentials
  skill              print where the agent skill is; --install [dir] links it (default ~/.claude/skills)

Screens
  capture            the app in the iOS Simulator → output/raw/<device>/<locale>/<shot>.png   --shots a,b
  import <paths>     use screenshots made elsewhere instead (files or folders; by name, then in order)
                     --store dir  --shots a,b  --device iphone-6.9  --locale en
  elements           UI elements of each capture that could pop out, ranked, numbered on
                     output/elements/marks.png   --slides a,b   --pick <n>|best|none (writes slides[].pop)

Design
  style [name]       write design/<style>.html from slides and look (default: look.style)
                     styles: ${styles().join(', ')}
  catalog [axis]     every option of one axis rendered from your captures, numbered on one sheet
                     → output/catalog/<axis>.png; axes: ${AXES.filter(a => a !== 'world').join(', ')}
                     --slides a,b (layout needs one)   --pick <n> (writes look.* or slides[].layout)
  proof              the app's App Store rating → look.proof (a laurel on look.proof.slides)   --country us

Output
  render             design + captures → output/final/<device>/<locale>/NN-<slide>.png
                     --slides a,b (rewrite only these)   --design design/x.html (→ output/variants/x/)
  review             output/review/: contact sheet, search-results mock, strip
  check              store and readability rules (size, alpha, count, text size, contrast); writes manifest
  build              render + review + check
  upload             plan the App Store Connect upload; --confirm applies it   --version 1.2.0

Research and assets
  refs               download top apps' screenshots → references/<country>/<app>/
                     --country us,pl --genres utilities,productivity --kind topfreeapplications --limit 25 --curated
  board              lettered sheet of reference sets from references/   --genres a,b | --apps a,b  --limit 8
  frames [model]     download Apple's device bezels (iphone-18-pro-max, ipad-pro-13-m5); else "frame": "generic"
  art                optional generated props from store/art.json (never app UI)   --only ids --variants N
  help               this text

Options
  [store]            folder with screenshots.json, or an app repo containing store/ (default ./store)
  --locales a,b  --devices iphone-6.9   narrow any stage
  --json             one JSON document on stdout (default when stdout is not a terminal); logs go to stderr

Exit codes: 0 ok · 1 usage/config · 2 capture/render · 3 check failed · 4 upload · 5 missing tool or credential
Errors carry {error, fix, next}. Environment: STORESHOTS_HOST, ASC_KEY_ID/ASC_ISSUER_ID/ASC_PRIVATE_KEY_PATH,
IMAGE_API_BASE/IMAGE_API_KEY, STORESHOTS_BROWSER, STORESHOTS_FRAMES.`;

/** argv → { command, positional, flags } with boolean flags and `--name value` pairs. */
function parse(argv) {
  const BOOLEAN = new Set(['json', 'confirm', 'yes', 'force', 'curated', 'help']);
  const OPTIONAL = new Set(['install']); // a flag that may or may not take a value
  const [command, ...rest] = argv;
  const positional = [], flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) { positional.push(a); continue; }
    const [name, inline] = a.slice(2).split('=');
    if (BOOLEAN.has(name)) flags[name] = true;
    else if (OPTIONAL.has(name) && inline === undefined && (rest[i + 1] === undefined || rest[i + 1].startsWith('--'))) flags[name] = true;
    else if (inline !== undefined) flags[name] = inline;
    else if (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--')) flags[name] = rest[++i];
    else throw usage(`--${name} needs a value`);
  }
  return { command, positional, flags };
}

const list = v => (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : undefined);

async function run({ command, positional, flags }) {
  if (!command || command === 'help' || flags.help) return { help: HELP };
  if (command === 'init') {
    return init(positional[0], { style: flags.style, locale: flags.locale, deviceId: flags.device, shots: list(flags.shots), force: flags.force });
  }
  if (command === 'frames') {
    const meta = installFrames(positional[0] ?? 'iphone-18-pro-max');
    return { model: positional[0] ?? 'iphone-18-pro-max', colours: meta };
  }
  if (command === 'board') {
    return board({ countries: list(flags.country) ?? ['us'], genres: list(flags.genres), apps: list(flags.apps), limit: Number(flags.limit ?? 8), out: flags.out });
  }
  if (command === 'refs') {
    const countries = list(flags.country) ?? ['us'], genres = list(flags.genres) ?? [null];
    const kinds = list(flags.kind) ?? ['topgrossingapplications'], limit = Number(flags.limit ?? 25);
    const summary = [];
    for (const country of countries) {
      const ids = new Map();
      for (const genre of genres) for (const kind of kinds) {
        for (const app of await topChart({ country, genre, kind, limit })) ids.set(app.id, `${kind}/${genre ?? 'all'}`);
      }
      const apps = await lookup([...ids.keys()], country);
      if (flags.curated) for (const term of CURATED) { const a = await search(term, country); if (a) { apps.push(a); ids.set(String(a.trackId), 'curated'); } }
      let saved = 0;
      for (const app of apps) {
        try { const r = saveApp(app, { country, tag: ids.get(String(app.trackId)) }); if (r && !r.cached) saved++; }
        catch (e) { console.error(`  ! ${app.trackName}: ${e.message}`); }
      }
      console.error(`${country}: ${apps.length} apps, ${saved} new sets`);
      summary.push({ country, apps: apps.length, new: saved });
    }
    return { countries: summary };
  }

  if (command === 'skill') return skill({ install: flags.install });
  const PROJECT = ['style', 'doctor', 'capture', 'import', 'catalog', 'elements', 'proof', 'render', 'review', 'check', 'build', 'upload', 'art'];
  if (!PROJECT.includes(command)) throw usage(`unknown command "${command}"`, { fix: 'run `storeshots help`' });
  // `catalog <axis> [store]`: the axis comes first.
  const storeArg = command === 'import' ? flags.store : command === 'catalog' && AXES.includes(positional[0]) ? positional[1] : positional[0];
  const store = command === 'style' ? null : command === 'doctor' && !positional[0] ? tryStore() : loadStore(storeArg, { design: flags.design });
  if (command === 'doctor') {
    const result = await doctor(store);
    if (!result.ok) throw Object.assign(new CliError('some required tools are missing', { exit: EXIT.ENV, fix: 'see the fix lines above' }), { result });
    return result;
  }
  if (command === 'style') {
    // `style <name> [store]`, or `style [store]` with look.style in screenshots.json.
    const named = positional[0] && styles().includes(positional[0]);
    return writeStyle(loadStore(named ? positional[1] : positional[0]), named ? positional[0] : undefined, { out: flags.out });
  }
  const options = { devices: list(flags.devices) ?? store.devices, locales: list(flags.locales ?? flags.locale) ?? store.locales };
  switch (command) {
    case 'capture': return capture(store, { ...options, only: list(flags.shots) });
    case 'import': return importShots(store, positional, { device: options.devices[0], locale: options.locales[0], shots: list(flags.shots) });
    case 'catalog': return catalog(store, { axis: AXES.includes(positional[0]) ? positional[0] : 'style', slides: list(flags.slides), pick: flags.pick });
    case 'proof': return proof(store, { country: flags.country });
    case 'elements': return elements(store, { slides: list(flags.slides), pick: flags.pick, locale: options.locales[0], device: options.devices[0] });
    case 'render': return { renders: await render(store, { ...options, slides: list(flags.slides) }) };
    case 'review': return { review: await review(store, options) };
    case 'check': return gate(check(store, options));
    case 'build': {
      const renders = await render(store, { ...options, slides: list(flags.slides) });
      const reviewed = await review(store, options);
      return gate({ renders, review: reviewed, ...check(store, options) });
    }
    case 'upload': {
      const verdict = check(store, { ...options, log: () => {} });
      if (!verdict.ok) throw new CliError('the rendered set fails `storeshots check`', { exit: EXIT.CHECK, detail: verdict.errors.join('\n'), fix: 'fix the errors, rebuild, then upload', next: 'storeshots build' });
      return upload(store, { ...options, version: flags.version, confirm: !!(flags.confirm || flags.yes) });
    }
    case 'art': return art(store, { only: list(flags.only), variants: flags.variants ? Number(flags.variants) : undefined });
    default: throw usage(`unknown command "${command}"`, { fix: 'run `storeshots help`' });
  }
}

function tryStore() { try { return loadStore(); } catch { return null; } }

/** Turns a failed check into exit code 3 while keeping the full result. */
function gate(result) {
  if (result.ok === false) throw Object.assign(new CliError(`check failed: ${result.errors.length} error(s)`, { exit: EXIT.CHECK, detail: result.errors.slice(0, 20).join('\n'), fix: 'fix the design or copy, then `storeshots build`', next: 'storeshots build' }), { result });
  return result;
}

const parsed = (() => { try { return parse(process.argv.slice(2)); } catch (e) { return { error: e }; } })();
const json = parsed.flags?.json || !process.stdout.isTTY;

try {
  if (parsed.error) throw parsed.error;
  const result = await run(parsed);
  if (result?.help) console.log(result.help);
  else if (json) process.stdout.write(JSON.stringify({ ok: true, command: parsed.command, ...result }) + '\n');
  else console.log(`${parsed.command}: ok`);
} catch (e) {
  const error = e instanceof CliError ? e : new CliError(e.message, { exit: EXIT.RUN, detail: e.stack?.split('\n').slice(1, 4).join('\n') });
  console.error(`error: ${error.message}${error.detail ? `\n${error.detail}` : ''}${error.fix ? `\nfix: ${error.fix}` : ''}${error.next ? `\nnext: ${error.next}` : ''}`);
  if (json) process.stdout.write(JSON.stringify({ ok: false, command: parsed.command, ...error.toJSON(), result: e.result }) + '\n');
  process.exitCode = error.exit;
}
