import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('root and adapter subpath expose explicit CLI adapter APIs', async () => {
  const root = await import('../../dist/index.js');
  const adapter = await import('../../dist/adapter/index.js');

  for (const module of [root, adapter]) {
    assert.equal(typeof module.createCliMain, 'function');
    assert.equal(typeof module.runCliMain, 'function');
    assert.equal(typeof module.renderRunResultText, 'function');
    assert.equal(typeof module.createNodeCliAdapter, 'function');
  }
});

test('adapter declarations include host, renderer, and process-like contracts', async () => {
  const text = await readFile(new URL('../../dist/adapter/index.d.ts', import.meta.url), 'utf8');
  const rootText = await readFile(new URL('../../dist/index.d.ts', import.meta.url), 'utf8');

  assert.match(text, /CliMainHost/);
  assert.match(text, /CliMainRequest/);
  assert.match(text, /NodeCliProcessLike/);
  assert.match(rootText, /CliMainResult/);
  assert.doesNotMatch(text, /internal\//);
});
