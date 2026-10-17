// `storeshots doctor`: every external dependency, with a fix for each missing one.
// Required for rendering: Node ≥ 20, ffmpeg, a Chromium browser. Capture needs a
// macOS host with Xcode (local or over SSH). Frames need 7z.
// Upload needs App Store Connect API credentials; art generation is optional.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { codexLogin, imageApiKey } from './art.mjs';
import { hasRembg } from './cutout.mjs';
import { ocrLanguages } from './elements.mjs';
import { launchBrowser } from './browser.mjs';
import { FRAMES_DIR } from './frames.mjs';
import { hostOutput, resolveHost } from './host.mjs';
import { ascCredentials } from './upload.mjs';

const has = cmd => { try { execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }); return true; } catch { return false; } };

export async function doctor(store, { log = console.error } = {}) {
  const checks = [];
  const add = (name, ok, detail, fix, required = true) => checks.push({ name, ok, required, detail, fix: ok ? undefined : fix });

  const major = Number(process.versions.node.split('.')[0]);
  add('node', major >= 20, process.versions.node, 'install Node.js 20 or newer');
  add('ffmpeg', has('ffmpeg'), has('ffmpeg') ? 'found' : 'missing', 'install ffmpeg (brew install ffmpeg / apt install ffmpeg)');
  try {
    const browser = await launchBrowser();
    add('browser', true, browser.browserType().name() + ' ' + browser.version());
    await browser.close();
  } catch (e) {
    add('browser', false, e.message, e.fix);
  }

  // Apple ships bezels as .dmg; frames.mjs unpacks them with 7z on every platform.
  const models = existsSync(FRAMES_DIR) ? readdirSync(FRAMES_DIR).filter(d => existsSync(join(FRAMES_DIR, d, 'meta.json'))) : [];
  add('frames', true, models.length ? `Apple bezels installed: ${models.join(', ')}` : 'generic (drawn); Apple bezels are optional', models.length || has('7z') ? undefined : 'for Apple bezels: install 7z (p7zip), then `storeshots frames`', false);

  const host = resolveHost(store?.config.capture?.host);
  try {
    const out = hostOutput(host, 'sw_vers -productVersion && xcrun simctl help >/dev/null && echo simctl-ok', { timeout: 30000 });
    add('simulator host', /simctl-ok/.test(out), `${host.label}: macOS ${out.split('\n')[0]}`);
  } catch (e) {
    add('simulator host', false, `${host.label}: ${e.message.split('\n')[0]}`, e.fix ?? 'set capture.host to {"ssh": "<mac>"} or STORESHOTS_HOST, and make sure Xcode is installed there; without a Mac, bring screenshots in with `storeshots import`', false);
  }

  let creds = null;
  try { creds = ascCredentials(); } catch (e) { add('App Store Connect key', false, e.message, e.fix, false); }
  if (!checks.some(c => c.name === 'App Store Connect key')) {
    add('App Store Connect key', !!creds, creds ? `key ${creds.keyId}` : 'not set (needed only for upload)', 'export ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH', false);
  }
  const langs = ocrLanguages();
  add('tesseract (OCR)', !!langs, langs ? `languages: ${langs.filter(l => l !== 'osd').join(', ')}` : 'not found (optional: `elements` then ranks by pixels only)', 'install tesseract-ocr and the language packs of your locales', false);
  const imageVia = imageApiKey() ? 'IMAGE_API_KEY set' : codexLogin() ? 'Codex CLI (ChatGPT login)' : null;
  add('image generation', !!imageVia, imageVia ?? 'none (optional)', '`codex login` with ChatGPT, or export IMAGE_API_KEY, to enable `storeshots art`', false);
  const rembg = hasRembg();
  add('rembg (cut-outs)', rembg, rembg ? 'found' : 'not found (optional: `storeshots cutout`)', 'uv tool install "rembg[cpu,cli]"', false);

  for (const c of checks) log(`${c.ok ? 'ok  ' : c.required ? 'FAIL' : 'warn'}  ${c.name.padEnd(22)} ${c.detail ?? ''}${c.fix ? `\n      fix: ${c.fix}` : ''}`);
  return { ok: checks.every(c => c.ok || !c.required), checks };
}
