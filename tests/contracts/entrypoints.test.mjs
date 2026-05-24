import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const entrypoints = [
  '../../dist/index.js',
  '../../dist/adapter/index.js',
  '../../dist/help/index.js',
  '../../dist/completion/index.js',
  '../../dist/manifest/index.js',
  '../../dist/config/index.js',
  '../../dist/effects/index.js',
  '../../dist/plugins/index.js',
  '../../dist/repair/index.js',
  '../../dist/schema/index.js',
  '../../dist/testing/index.js'
];

test('root and subpath entrypoints load', async () => {
  for (const entrypoint of entrypoints) {
    const module = await import(entrypoint);
    assert.equal(module.cliCorePackage.name, '@ismail-elkorchi/cli-core');
  }
});

test('testing subpath exposes harness and fixture contracts', async () => {
  const module = await import('../../dist/testing/index.js');

  assert.equal(typeof module.createCliHarness, 'function');
  assert.equal(typeof module.createLargeCommandDefinition, 'function');
  assert.equal(typeof module.createLargeCommandFixture, 'function');
  assert.equal(typeof module.runCliScenario, 'function');
  assert.equal(typeof module.defineCliFixture, 'function');
});

test('public declaration files do not expose internal module paths', async () => {
  const declarations = [
    '../../dist/index.d.ts',
    '../../dist/adapter/index.d.ts',
    '../../dist/help/index.d.ts',
    '../../dist/completion/index.d.ts',
    '../../dist/manifest/index.d.ts',
    '../../dist/config/index.d.ts',
    '../../dist/effects/index.d.ts',
    '../../dist/plugins/index.d.ts',
    '../../dist/repair/index.d.ts',
    '../../dist/schema/index.d.ts',
    '../../dist/testing/index.d.ts'
  ];

  for (const declaration of declarations) {
    const text = await readFile(new URL(declaration, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /internal\//);
  }
});
