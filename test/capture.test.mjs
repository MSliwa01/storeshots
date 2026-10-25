import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capture } from '../src/capture.mjs';
import { CliError } from '../src/errors.mjs';

test('a manual-only display stops the whole capture before using the simulator host', () => {
  const store = {
    config: { capture: { bundleId: 'test.app', host: { command: 'missing-test-host' } } },
    shots: { hero: {} },
  };
  assert.throws(() => capture(store, {
    devices: ['iphone-6.9', 'iphone-duo-inner'], locales: ['en'],
  }), e => e instanceof CliError && /automatic capture/.test(e.message)
    && e.next === 'storeshots import <screenshots> --device iphone-duo-inner');
});
