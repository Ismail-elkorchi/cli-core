import assert from 'node:assert/strict';
import test from 'node:test';

test('foundation benchmark lane is executable', async () => {
  const started = performance.now();
  const module = await import('../../dist/index.js');
  const elapsed = performance.now() - started;

  assert.equal(module.cliCorePackage.name, '@ismail-elkorchi/cli-core');
  assert.equal(Number.isFinite(elapsed), true);
});
