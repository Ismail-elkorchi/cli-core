import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('adapter subpath exposes explicit CLI adapter APIs', async () => {
  const adapter = await import('../../dist/adapter/index.js');

  assert.equal(typeof adapter.createCliMain, 'function');
  assert.equal(typeof adapter.runCliMain, 'function');
  assert.equal(typeof adapter.renderRunResultText, 'function');
  assert.equal(typeof adapter.createNodeCliAdapter, 'function');
});

test('adapter declarations include host, renderer, and process-like contracts', async () => {
  const text = await readFile(new URL('../../dist/adapter/index.d.ts', import.meta.url), 'utf8');

  assert.match(text, /CliMainHost/);
  assert.match(text, /CliMainRequest/);
  assert.match(text, /NodeCliProcessLike/);
  assert.doesNotMatch(text, /internal\//);
});
