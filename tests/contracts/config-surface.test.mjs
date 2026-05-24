import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('root and config subpath expose config resolution', async () => {
  const root = await import('../../dist/index.js');
  const config = await import('../../dist/config/index.js');

  assert.equal(typeof root.resolveCliConfig, 'function');
  assert.equal(typeof config.resolveCliConfig, 'function');
  assert.equal(typeof config.discoverCliConfigInput, 'function');
  assert.equal(typeof config.createMemoryConfigDiscoveryHost, 'function');
});

test('config declarations include discovery host contracts', async () => {
  const text = await readFile(new URL('../../dist/config/index.d.ts', import.meta.url), 'utf8');
  const root = await readFile(new URL('../../dist/index.d.ts', import.meta.url), 'utf8');

  assert.match(text, /ConfigDiscoveryHost/);
  assert.match(text, /ConfigDiscoveryHostResult/);
  assert.match(text, /ConfigDiscoveryRequest/);
  assert.match(text, /ConfigDiscoveryCollection/);
  assert.doesNotMatch(root, /createMemoryConfigDiscoveryHost/);
  assert.doesNotMatch(text, /internal\//);
});
