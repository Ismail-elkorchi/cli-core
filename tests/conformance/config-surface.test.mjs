import assert from 'node:assert/strict';
import test from 'node:test';

test('root and config subpath expose config resolution', async () => {
  const root = await import('../../dist/index.js');
  const config = await import('../../dist/config/index.js');

  assert.equal(typeof root.resolveCliConfig, 'function');
  assert.equal(typeof config.resolveCliConfig, 'function');
});
