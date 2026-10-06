// Raw captures on the iOS Simulator, as one shell script on the simulator's host
// (this Mac, or a Mac over SSH — see host.mjs): simulator per device (created on first
// use) → 9:41 status bar → appearance → launch with the app's demo arguments and the
// locale → screenshot → copy back to <store>/output/raw/<device>/<locale>/<shot>.png.
// The app must already be installed on that simulator (a Release build).
import { device as deviceSpec } from './devices.mjs';
import { CliError, EXIT, usage } from './errors.mjs';
import { pullDir, quote, resolveHost, runScript } from './host.mjs';

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';

/** "pl" → ["pl", "pl_PL"]; "en-US" → ["en-US", "en_US"]; map overrides in capture.locales. */
function appleLocale(locale, map = {}) {
  if (map[locale]) return map[locale];
  const [lang, region] = locale.split(/[-_]/);
  return [locale, `${lang}_${(region ?? lang).toUpperCase()}`];
}

const REMOTE_HELPERS = String.raw`
ensure_sim() {
  local name="$1" type="$2" udid runtime
  udid=$(xcrun simctl list devices available | grep -F "$name (" | grep -oE '[0-9A-F-]{36}' | head -1)
  if [ -z "$udid" ]; then
    runtime=$(xcrun simctl list runtimes available | grep -oE 'com\.apple\.CoreSimulator\.SimRuntime\.iOS-[0-9-]+' | tail -1)
    udid=$(xcrun simctl create "$name" "$type" "$runtime")
    echo "created simulator $name ($udid)" >&2
  fi
  echo "$udid"
}
prepare_sim() {
  local udid="$1"
  xcrun simctl boot "$udid" 2>/dev/null || true
  xcrun simctl bootstatus "$udid" -b >/dev/null
  # ISO time with the Mac's offset also sets the date that iPads show; "Z" and "+01:00" are rejected.
  xcrun simctl status_bar "$udid" override --time "$(date +%Y-%m-%d)T09:41:00.000$(date +%z)" \
    --dataNetwork wifi --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 \
    --operatorName '' --batteryState discharging --batteryLevel 100
}
# Called right after a launch. Remembers the first frame (the launch screen), waits at
# least $2 s, then until the screen differs from that frame and stays identical for 3
# frames 1 s apart (spinners and transitions done), at most $3 s; keeps the last frame.
shoot_when_idle() {
  local udid="$1" min="$2" max="$3" out="$4" first prev="" sum t=0 same=0
  xcrun simctl io "$udid" screenshot --type=png "$out" >/dev/null 2>&1
  first=$(md5 -q "$out" 2>/dev/null || md5sum "$out" | cut -d' ' -f1)
  sleep "$min"
  while :; do
    xcrun simctl io "$udid" screenshot --type=png "$out" >/dev/null 2>&1
    sum=$(md5 -q "$out" 2>/dev/null || md5sum "$out" | cut -d' ' -f1)
    if [ "$sum" = "$prev" ] && [ "$sum" != "$first" ]; then same=$((same + 1)); else same=0; fi
    [ "$same" -ge 2 ] && return 0
    t=$((t + 1)); [ "$t" -ge "$max" ] && { echo "warning: screen not settled after $max s: $out" >&2; return 0; }
    prev="$sum"; sleep 1
  done
}
`;

export function capture(store, { devices, locales, only, log = console.error }) {
  const cfg = store.config.capture ?? {};
  if (!cfg.bundleId) throw usage('screenshots.json: capture.bundleId is missing', { fix: 'add "capture": {"bundleId": "<your.bundle.id>"} to screenshots.json' });
  const unknown = (only ?? []).filter(id => !store.shots[id]);
  if (unknown.length) throw usage(`unknown shot(s): ${unknown.join(', ')}`, { fix: `known shots: ${Object.keys(store.shots).join(', ')}` });
  const shots = Object.entries(store.shots).filter(([id, shot]) => shot.capture !== false && (!only || only.includes(id)));
  if (!shots.length) throw usage('nothing to capture', { fix: 'declare shots in screenshots.json → "shots"' });
  const host = resolveHost(cfg.host);
  const remote = `/tmp/storeshots/${slug(store.app.name ?? cfg.bundleId)}`;

  const script = ['set -e', REMOTE_HELPERS, `rm -rf ${quote(remote)}`];
  for (const deviceId of devices) {
    const sim = deviceSpec(deviceId).simulator;
    script.push(
      `UDID=$(ensure_sim ${quote(sim.name)} ${quote(sim.type)})`,
      'prepare_sim "$UDID"',
      `xcrun simctl get_app_container "$UDID" ${quote(cfg.bundleId)} >/dev/null 2>&1 || { echo "${cfg.bundleId} is not installed on ${sim.name}" >&2; exit 42; }`,
      // Warm-up: the first cold start after an install can outlast a shot's wait.
      `xcrun simctl launch --terminate-running-process "$UDID" ${quote(cfg.bundleId)} ${Object.entries(cfg.args ?? {}).flatMap(([k, v]) => [`-${k}`, quote(v)]).join(' ')} >/dev/null`,
      `shoot_when_idle "$UDID" 2 ${Number(cfg.warmup ?? 60)} /tmp/storeshots-warmup.png`,
    );
    for (const locale of locales) {
      const [language, region] = appleLocale(locale, cfg.locales);
      const dir = `${remote}/${deviceId}/${locale}`;
      script.push(`mkdir -p ${quote(dir)}`);
      for (const [id, shot] of shots) {
        const args = { AppleLanguages: `(${language})`, AppleLocale: region, ...cfg.args, ...shot.args };
        const argv = Object.entries(args).flatMap(([k, v]) => [`-${k}`, quote(v)]).join(' ');
        script.push(
          `xcrun simctl ui "$UDID" appearance ${quote(shot.appearance ?? cfg.appearance ?? 'light')}`,
          `xcrun simctl launch --terminate-running-process "$UDID" ${quote(cfg.bundleId)} ${argv} >/dev/null`,
          `shoot_when_idle "$UDID" ${Number(shot.wait ?? cfg.wait ?? 3)} ${Number(shot.maxWait ?? cfg.maxWait ?? 30)} ${quote(`${dir}/${id}.png`)}`,
          `echo "captured ${deviceId}/${locale}/${id}"`,
        );
      }
    }
    script.push(`xcrun simctl terminate "$UDID" ${quote(cfg.bundleId)} 2>/dev/null || true`);
  }

  const status = runScript(host, script.join('\n'));
  if (status === 42) {
    throw new CliError(`${cfg.bundleId} is not installed on the screenshot simulator`, {
      exit: EXIT.RUN,
      fix: `install a Release build on "${devices.map(d => deviceSpec(d).simulator.name).join('", "')}" (e.g. xcodebuild … -destination 'platform=iOS Simulator,name=<name>' then xcrun simctl install)`,
    });
  }
  if (status) throw new CliError(`capture failed on ${host.label} (exit ${status})`, { exit: EXIT.RUN, fix: 'read the simctl output above; run `storeshots doctor` to check the host' });
  pullDir(host, remote, store.paths.raw);
  const files = [];
  for (const deviceId of devices) for (const locale of locales) for (const [id] of shots) files.push(store.rawShot(deviceId, locale, id));
  log(`raw captures in ${store.paths.raw}`);
  return { raw: store.paths.raw, host: host.label, files };
}
