import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { device, sizeFits, videoProblems } from '../src/devices.mjs';
import { importShots } from '../src/import.mjs';
import { KIT_DIR } from '../src/paths.mjs';
import { loadStore } from '../src/store.mjs';
import { probe, renderVideos } from '../src/video.mjs';
import { tmp } from './helpers.mjs';

test('video specs: exact and ranged sizes, frame rates, lengths, audio', () => {
  const header = device('header'), search = device('search'), preview = device('preview-iphone-6.9');
  assert.ok(sizeFits(header, 3840, 1646));
  assert.ok(!sizeFits(header, 1920, 823));
  assert.ok(sizeFits(search, 1920, 1280) && sizeFits(search, 3840, 2560) && !sizeFits(search, 1800, 1200));
  const good = { width: 3840, height: 1646, fps: 30, duration: 12, audio: false, bytes: 1e6, ext: '.mp4' };
  assert.deepEqual(videoProblems(header, good), []);
  assert.match(videoProblems(header, { ...good, fps: 25 }).join(), /30 or 60/);
  assert.match(videoProblems(header, { ...good, duration: 6 }).join(), /10–30 s/);
  assert.match(videoProblems(search, { ...good, width: 2880, height: 1920, duration: 10 }).join(), /15–30 s/);
  assert.deepEqual(videoProblems(preview, { width: 886, height: 1920, fps: 24, duration: 20, audio: true, bytes: 1e6, ext: '.mov' }), []);
  assert.match(videoProblems(preview, { width: 886, height: 1920, fps: 30, duration: 20, audio: false, bytes: 1e6 }).join(), /audio/);
});

// A one-slide app preview: a caption, a box moved by a CSS animation, and the phone showing
// a screen recording. Small canvases keep it fast; the pipeline is the real one.
const DESIGN = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: Instrument; src: url("${join(KIT_DIR, 'fonts/InstrumentSans.ttf')}"); }
  body { margin: 0; font-family: Instrument, sans-serif; }
  .slide { position: relative; width: var(--slide-w); height: var(--slide-h); background: #f4f1ea; overflow: hidden; }
  h1 { position: absolute; left: 8%; top: 4%; margin: 0; font-size: calc(var(--u) * 9); color: #16181d; }
  .box { position: absolute; left: 0; bottom: 4%; width: 20%; height: 8%; background: #e4572e; animation: slide 2s linear forwards; }
  @keyframes slide { to { transform: translateX(380%); } }
  .screen { position: absolute; left: 20%; top: 20%; width: 60%; }
</style></head><body>
  <section class="slide" id="demo"><h1 data-text="demo" data-role="title">Rain, live</h1><div class="screen" data-shot="demo"></div><div class="box"></div></section>
</body></html>`;

test('video: a design renders to H.264 with audio, animations advance, a recording plays', async () => {
  const dir = tmp();
  mkdirSync(join(dir, 'design'), { recursive: true });
  mkdirSync(join(dir, 'copy'), { recursive: true });
  writeFileSync(join(dir, 'design', 'preview.html'), DESIGN);
  writeFileSync(join(dir, 'copy', 'en.json'), JSON.stringify({ demo: 'Rain, live' }));
  writeFileSync(join(dir, 'screenshots.json'), JSON.stringify({
    app: { name: 'Test' }, locales: ['en'], shots: { demo: {} },
    devices: { 'iphone-6.9': { width: 132, height: 286 }, 'preview-iphone-6.9': { width: 222, height: 480, design: 'design/preview.html', video: { duration: 2, fps: 10 } } },
  }));
  // A "screen recording" that changes colour every frame, imported like a simulator one.
  const rec = join(tmp(), 'demo.mp4');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=132x286:r=10:d=2', '-pix_fmt', 'yuv420p', rec]);
  const store = loadStore(dir);
  const imported = importShots(store, [rec], { device: 'iphone-6.9', locale: 'en', shots: ['demo'], log: () => {} });
  assert.ok(imported.imported[0].clip.endsWith('demo.mp4'));
  assert.ok(existsSync(store.rawShot('iphone-6.9', 'en', 'demo')), 'a still is made for the shot');

  const logs = [];
  const [result] = await renderVideos(store, { devices: ['preview-iphone-6.9'], locales: ['en'], log: m => logs.push(m) });
  const out = result.files[0].file;
  assert.match(out, /01-demo\.mp4$/);
  const info = probe(out);
  assert.equal(info.width, 222);
  assert.equal(info.height, 480);
  assert.equal(Math.round(info.fps), 10);
  assert.ok(Math.abs(info.duration - 2) < 0.15, `duration ${info.duration}`);
  assert.equal(info.audio, true, 'app previews get a (silent) audio track');
  assert.equal(info.codec, 'h264');
  assert.match(logs.join('\n'), /clips: demo/);
  // The spec check runs on every render: 2 s is too short for an app preview.
  assert.match(result.files[0].problems.join(), /15–30 s/);

  // First and last frames differ (the box moved, the recording advanced).
  const frame = at => execFileSync('ffmpeg', ['-loglevel', 'error', '-ss', at, '-i', out, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1']);
  const a = frame('0'), b = frame('1.85');
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
  assert.ok(diff / a.length > 2, `frames barely differ (${diff / a.length})`);
});
