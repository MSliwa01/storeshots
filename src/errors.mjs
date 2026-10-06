// The CLI contract shared by every command (documented in `storeshots --help`):
// exit codes, and errors that tell the caller (often an agent) how to recover.

export const EXIT = {
  OK: 0,
  USAGE: 1, // bad arguments or project config
  RUN: 2, // capture or render failed (simulator, browser, ffmpeg, design page)
  CHECK: 3, // the rendered set breaks a store or readability rule
  UPLOAD: 4, // App Store Connect refused or the version is locked
  ENV: 5, // missing tool or credential (see `storeshots doctor`)
};

/** An error with a one-line fix and the next command to run. */
export class CliError extends Error {
  constructor(message, { exit = EXIT.USAGE, fix, next, detail } = {}) {
    super(message);
    this.exit = exit;
    this.fix = fix;
    this.next = next;
    this.detail = detail;
  }

  toJSON() {
    return { error: this.message, exit: this.exit, fix: this.fix, next: this.next, detail: this.detail };
  }
}

export const usage = (message, extra) => new CliError(message, { exit: EXIT.USAGE, ...extra });
export const envError = (message, extra) => new CliError(message, { exit: EXIT.ENV, next: 'storeshots doctor', ...extra });
