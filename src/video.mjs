// `storeshots video`: renders a design as video, frame by frame, for app previews, product
// page headers, search results assets and In-App Events. Each frame is the design at time t
// (window.__seek in the kit): recorded clips step to their frame, CSS animations stop at t.
// Chrome takes a JPEG of the slide and ffmpeg encodes the frames to H.264 (yuv420p), with
// an audio track where App Store Connect wants one (app previews: the project's audio file,
// else silence). Output: output/video/<device>/<locale>/NN-<slide>.mp4.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveAssets } from './assets.mjs';
import { launchBrowser } from './browser.mjs';
import { videoProblems } from './devices.mjs';
import { CliError, EXIT, usage } from './errors.mjs';
import { buildPage, screenDevice } from './render.mjs';

const VIDEO = /^\d+-.+\.(mp4|mov|m4v)$/i;

/** What App Store Connect checks in a video: size, frame rate, length, audio, bytes. */
export function probe(file) {
  let out;
  try {
    out = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { encoding: 'utf8' }));
  } catch (e) {
    throw new CliError(`cannot read ${file} as video`, { exit: EXIT.RUN, detail: e.message.split('\n')[0], fix: 'check the file, and that ffprobe (ffmpeg) is installed' });
  }
  const v = out.streams.find(s => s.codec_type === 'video');
  if (!v) throw new CliError(`${file} has no video stream`, { exit: EXIT.RUN });
  const rate = v.avg_frame_rate && v.avg_frame_rate !== '0/0' ? v.avg_frame_rate : v.r_frame_rate;
  const [n, d] = rate.split('/').map(Number);
  const rotation = Math.abs(Number(v.tags?.rotate ?? v.side_data_list?.find(x => x.rotation != null)?.rotation ?? 0)) % 180;
  return {
    width: rotation === 90 ? v.height : v.width,
    height: rotation === 90 ? v.width : v.height,
    fps: n / (d || 1),
    duration: Number(out.format.duration ?? v.duration),
    audio: out.streams.some(s => s.codec_type === 'audio'),
    codec: v.codec_name,
    bytes: statSync(file).size,
    ext: extname(file).toLowerCase(),
  };
}

/** The rendered (or dropped-in) videos of one canvas and locale, in order. */
export function videoFiles(store, deviceId, locale) {
  const dir = join(store.paths.video, deviceId, locale);
  return existsSync(dir) ? readdirSync(dir).filter(f => VIDEO.test(f)).sort().map(f => join(dir, f)) : [];
}

/** Problems of each video of a canvas against its spec: [{ file, problems }]. */
export function checkVideos(store, device, locale) {
  return videoFiles(store, device.id, locale).map(file => {
    const info = probe(file);
    return { file, probe: info, problems: device.video ? videoProblems(device, info) : [] };
  });
}

/**
 * Cuts a recording into JPEG frames at `fps`, scaled to the screen's capture size, once:
 * a stamp of the source's size and time skips the work on the next run.
 */
function extractClip(file, dir, { fps, width, height }) {
  const stamp = `${statSync(file).size}:${statSync(file).mtimeMs}:${fps}:${width}x${height}`;
  const stampFile = join(dir, 'stamp');
  if (!(existsSync(stampFile) && readFileSync(stampFile, 'utf8') === stamp)) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', file, '-vf', `fps=${fps},scale=${width}:${height}:flags=lanczos`, '-q:v', '2', join(dir, 'f%05d.jpg')]);
    writeFileSync(stampFile, stamp);
  }
  const count = readdirSync(dir).filter(f => f.endsWith('.jpg')).length;
  if (!count) throw new CliError(`no frames in ${file}`, { exit: EXIT.RUN });
  return { dir, count, fps };
}

/** Video settings: screenshots.json "video", then devices.<id>.video, then the slide's data-duration. */
function settings(store, device) {
  const own = { ...(store.config.video ?? {}), ...(store.config.devices?.[device.id]?.video ?? {}) };
  const spec = device.video;
  const fps = Number(own.fps ?? (spec ? Math.min(30, spec.fps[spec.fps.length - 1]) : 30));
  const duration = Number(own.duration ?? (spec ? Math.min(spec.max, Math.max(15, spec.min)) : 15));
  const audio = own.audio ? resolve(store.dir, own.audio) : null;
  if (audio && !existsSync(audio)) throw usage(`video.audio not found: ${audio}`, { fix: 'point video.audio at an audio file (relative to the store folder), or remove it for a silent track' });
  return { fps, duration, audio, needsAudio: !!spec?.audio };
}

/** Encodes JPEG frames written to its stdin; resolves when ffmpeg exits. */
function encoder(out, { fps, duration, audio, needsAudio }) {
  const sound = audio ? ['-i', audio] : needsAudio ? ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'] : [];
  const args = ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0', ...sound,
    '-map', '0:v', ...(sound.length ? ['-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2', '-af', 'apad', '-t', String(duration)] : []),
    '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-r', String(fps), '-movflags', '+faststart', out];
  const child = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  const done = new Promise((ok, fail) => child.on('close', code => (code === 0 ? ok() : fail(new CliError(`ffmpeg failed encoding ${out}`, { exit: EXIT.RUN, detail: stderr.slice(-600) })))));
  const write = buf => new Promise(ok => (child.stdin.write(buf) ? ok() : child.stdin.once('drain', ok)));
  return { write, end: () => { child.stdin.end(); return done; } };
}

export async function renderVideos(store, { devices, locales, slides: onlySlides, log = console.error }) {
  const browser = await launchBrowser();
  const results = [];
  try {
    const assets = await resolveAssets(store, browser, log);
    for (const deviceId of devices) {
      const device = store.device(deviceId), screen = screenDevice(store, device), how = settings(store, device);
      for (const locale of locales) {
        // Recordings of the shots this design shows, cut into frames at the video's rate.
        const clips = {};
        for (const shot of Object.keys(store.shots)) {
          const file = store.clipFile(screen.id, locale, shot);
          if (file) clips[shot] = extractClip(file, join(store.paths.build, 'clips', `${screen.id}-${locale}-${shot}`), { fps: how.fps, width: screen.width, height: screen.height });
        }
        mkdirSync(store.paths.build, { recursive: true });
        const pageFile = join(store.paths.build, `${deviceId}-${locale}-video.html`);
        writeFileSync(pageFile, buildPage(store, device, locale, log, assets, clips));
        const page = await browser.newPage({ viewport: { width: device.width, height: device.height }, deviceScaleFactor: 1 });
        const pageErrors = [];
        page.on('pageerror', e => pageErrors.push(e.message));
        await page.goto(pathToFileURL(pageFile).href, { waitUntil: 'load', timeout: 120000 });
        const report = await page.evaluate(() => window.__kit);
        await page.setViewportSize({ width: device.width * report.slides.length, height: device.height });
        const durations = await page.evaluate(() => [...document.querySelectorAll('.slide')].map(el => Number(el.dataset.duration) || null));

        const outDir = join(store.paths.video, deviceId, locale);
        mkdirSync(outDir, { recursive: true });
        if (!onlySlides) for (const old of readdirSync(outDir).filter(f => VIDEO.test(f))) rmSync(join(outDir, old));
        const files = [];
        for (const [i, slide] of report.slides.entries()) {
          if (onlySlides && !onlySlides.includes(slide.id)) continue;
          const duration = durations[i] ?? how.duration, frames = Math.round(duration * how.fps);
          const out = join(outDir, `${String(i + 1).padStart(2, '0')}-${slide.id}.mp4`);
          const enc = encoder(out, { ...how, duration });
          const clip = { x: i * device.width, y: 0, width: device.width, height: device.height };
          for (let f = 0; f < frames; f++) {
            await page.evaluate(t => window.__seek(t), f / how.fps);
            await enc.write(await page.screenshot({ clip, type: 'jpeg', quality: 92 }));
          }
          await enc.end();
          const problems = device.video ? videoProblems(device, probe(out)) : [];
          files.push({ file: out, slide: slide.id, duration, problems });
          log(`video ${deviceId}/${locale}/${slide.id}: ${duration} s at ${how.fps} fps${Object.keys(clips).length ? `, clips: ${Object.keys(clips).join(', ')}` : ''}${problems.length ? `\n  ! ${problems.join('\n  ! ')}` : ''}`);
        }
        for (const p of [...report.problems, ...pageErrors.map(message => ({ type: 'page-error', message }))]) log(`  ! ${JSON.stringify(p)}`);
        await page.close();
        results.push({ device: deviceId, locale, dir: outDir, files });
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}
