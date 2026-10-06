import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { resolveHost } from '../src/host.mjs';

afterEach(() => delete process.env.STORESHOTS_HOST);

test('host: local by default, ssh shorthand, wrapper command, env override', () => {
  assert.equal(resolveHost().kind, 'local');
  assert.deepEqual(resolveHost({ ssh: 'mac' }).prefix, ['ssh', 'mac']);
  assert.deepEqual(resolveHost({ command: 'my-wrapper ssh' }).prefix, ['my-wrapper', 'ssh']);
  process.env.STORESHOTS_HOST = 'ssh other-mac';
  assert.deepEqual(resolveHost({ ssh: 'mac' }).prefix, ['ssh', 'other-mac']);
  process.env.STORESHOTS_HOST = 'local';
  assert.equal(resolveHost({ ssh: 'mac' }).kind, 'local');
});
