import assert from 'node:assert/strict';
import test from 'node:test';

const entrypoints = [
  '../../dist/index.js',
  '../../dist/help/index.js',
  '../../dist/completion/index.js',
  '../../dist/manifest/index.js',
  '../../dist/config/index.js',
  '../../dist/plugins/index.js',
  '../../dist/repair/index.js',
  '../../dist/testing/index.js'
];

test('root and subpath entrypoints load', async () => {
  for (const entrypoint of entrypoints) {
    const module = await import(entrypoint);
    assert.equal(module.cliCorePackage.name, '@ismail-elkorchi/cli-core');
  }
});
