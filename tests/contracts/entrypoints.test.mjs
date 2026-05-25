import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('root and subpath entrypoints load', async () => {
  const root = await import('../../dist/index.js');
  const command = await import('../../dist/command/public.js');
  const adapter = await import('../../dist/adapter/index.js');
  const help = await import('../../dist/help/index.js');
  const completion = await import('../../dist/completion/index.js');
  const manifest = await import('../../dist/manifest/index.js');
  const config = await import('../../dist/config/index.js');
  const effects = await import('../../dist/effects/index.js');
  const plugins = await import('../../dist/plugins/index.js');
  const repair = await import('../../dist/repair/index.js');
  const schema = await import('../../dist/schema/index.js');
  const testing = await import('../../dist/testing/index.js');

  assert.equal(typeof root.defineCli, 'function');
  assert.equal(typeof root.findCliCommand, 'undefined');
  assert.equal(typeof command.findCliCommand, 'function');
  assert.equal(typeof adapter.createCliMain, 'function');
  assert.equal(typeof help.createHelpDocument, 'function');
  assert.equal(typeof completion.completeCli, 'function');
  assert.equal(typeof manifest.describeCli, 'function');
  assert.equal(typeof config.resolveCliConfig, 'function');
  assert.equal(typeof effects.applyCliEffects, 'function');
  assert.equal(typeof plugins.defineCliPluginManifest, 'function');
  assert.equal(typeof repair.createRepairSuggestionResult, 'function');
  assert.equal(typeof schema.describeCliSchemas, 'function');
  assert.equal(typeof testing.createCliHarness, 'function');
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
    '../../dist/command/public.d.ts',
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
