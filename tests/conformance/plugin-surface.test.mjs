import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('root and plugins subpath expose plugin contract APIs', async () => {
  const root = await import('../../dist/index.js');
  const plugins = await import('../../dist/plugins/index.js');

  assert.equal(typeof root.defineCliPluginManifest, 'function');
  assert.equal(typeof root.checkCliPluginCompatibility, 'function');
  assert.equal(typeof root.createCliPluginHost, 'function');
  assert.equal(typeof root.applyCliPluginCommands, 'function');
  assert.equal(typeof plugins.defineCliPluginManifest, 'function');
  assert.equal(typeof plugins.checkCliPluginCompatibility, 'function');
  assert.equal(typeof plugins.createCliPluginHost, 'function');
  assert.equal(typeof plugins.applyCliPluginCommands, 'function');
});

test('plugin declarations include manifest, host, hook, and diagnostic contracts', async () => {
  const text = await readFile(new URL('../../dist/plugins/index.d.ts', import.meta.url), 'utf8');

  assert.match(text, /CliPluginManifest/);
  assert.match(text, /CliPluginCommandApplication/);
  assert.match(text, /CliPluginCommandContribution/);
  assert.match(text, /CliPluginHost/);
  assert.match(text, /CliPluginHookPlan/);
  assert.match(text, /CliPluginHookRunResult/);
  assert.doesNotMatch(text, /internal\//);
});
