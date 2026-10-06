// Where the iOS Simulator lives. Captures run as one shell script on that host:
//   local (default on macOS):  bash -s
//   ssh:   capture.host = { "ssh": "my-mac" }            → ssh my-mac bash -s
//   any wrapper that takes a command string:
//          capture.host = { "command": "my-wrapper ssh" } → my-wrapper ssh 'bash -s'
// The STORESHOTS_HOST environment variable overrides the config with the same
// syntax as "command" (e.g. STORESHOTS_HOST="ssh my-mac"), so a project's config
// doesn't have to name anyone's machine.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { envError } from './errors.mjs';

export const quote = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** Normalised host: { kind: 'local' } or { kind: 'remote', prefix: [...argv], label }. */
export function resolveHost(config = {}) {
  const fromEnv = process.env.STORESHOTS_HOST?.trim();
  const command = fromEnv || config.command || (config.ssh ? `ssh ${config.ssh}` : null);
  if (command && command !== 'local') {
    const prefix = command.split(/\s+/);
    return { kind: 'remote', prefix, label: command };
  }
  return { kind: 'local', label: 'local' };
}

function assertLocalMac(host) {
  if (host.kind === 'local' && process.platform !== 'darwin') {
    throw envError('the iOS Simulator needs macOS, and no remote host is configured', {
      fix: 'set capture.host in screenshots.json to {"ssh": "<your-mac>"} or export STORESHOTS_HOST="ssh <your-mac>"; or bring screenshots made elsewhere in with `storeshots import <files>`',
    });
  }
}

/** Runs a bash script on the host, streaming its output to stderr. Returns the exit status. */
export function runScript(host, script) {
  assertLocalMac(host);
  const [cmd, ...args] = host.kind === 'local' ? ['bash', '-s'] : [...host.prefix, 'bash -s'];
  const run = spawnSync(cmd, args, { input: script, stdio: ['pipe', process.stderr, process.stderr] });
  if (run.error) throw envError(`cannot run ${cmd}: ${run.error.message}`, { fix: `check that "${host.label}" works from this shell` });
  return run.status;
}

/** Runs one command on the host and returns its stdout. */
export function hostOutput(host, command, { timeout = 60000 } = {}) {
  assertLocalMac(host);
  const [cmd, ...args] = host.kind === 'local' ? ['bash', '-c', command] : [...host.prefix, command];
  return execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Copies a directory from the host into a local directory. */
export function pullDir(host, remoteDir, localDir) {
  mkdirSync(localDir, { recursive: true });
  if (host.kind === 'local') return cpSync(remoteDir, localDir, { recursive: true });
  // No AppleDouble (._*) files or xattrs from macOS tar.
  const pack = `COPYFILE_DISABLE=1 tar --no-mac-metadata -C ${quote(remoteDir)} -cf - .`;
  const remote = [...host.prefix, pack].map(quote).join(' ');
  execFileSync('bash', ['-c', `${remote} | tar --warning=no-unknown-keyword -x -C ${quote(localDir)}`], { stdio: ['ignore', 'inherit', process.stderr] });
}
