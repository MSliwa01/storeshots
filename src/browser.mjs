import { chromium } from 'playwright-core';
import { envError } from './errors.mjs';

const ARGS = ['--allow-file-access-from-files', '--force-color-profile=srgb', '--font-render-hinting=none', '--hide-scrollbars'];

/**
 * Headless Chromium that may read the local captures, fonts and bezels.
 * Tries system Chrome, then system Chromium, then Playwright's own build;
 * STORESHOTS_BROWSER=<path> picks an explicit executable.
 */
export async function launchBrowser() {
  const attempts = process.env.STORESHOTS_BROWSER
    ? [{ executablePath: process.env.STORESHOTS_BROWSER }]
    : [{ channel: 'chrome' }, { channel: 'chromium' }, {}];
  const failures = [];
  for (const how of attempts) {
    try {
      return await chromium.launch({ headless: true, args: ARGS, ...how });
    } catch (e) {
      failures.push(`${JSON.stringify(how)}: ${e.message.split('\n')[0]}`);
    }
  }
  throw envError('no Chromium-based browser found', {
    fix: 'install Google Chrome, or run `npx playwright-core install chromium`, or set STORESHOTS_BROWSER=/path/to/chrome',
    detail: failures.join('\n'),
  });
}
