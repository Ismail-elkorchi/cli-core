import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runCommandModelExample } from '../../examples/command-model.mjs';
import { runHelpManifestExample } from '../../examples/help-manifest.mjs';
import { runTestingHarnessExample } from '../../examples/testing-harness.mjs';

test('README documents current public surface without feature-complete claims', async () => {
  const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');

  assert.match(readme, /active implementation/);
  assert.match(readme, /defineCli/);
  assert.match(readme, /describeCli/);
  assert.match(readme, /createCliHarness/);
  assert.doesNotMatch(readme, /feature-complete/i);
});

test('command model example executes against the built package', async () => {
  const { invocation, validation } = await runCommandModelExample();

  assert.equal(invocation.ok, true);
  assert.equal(validation.ok, true);
  assert.deepEqual(invocation.commandPath, ['deploy']);
});

test('testing harness example executes against the built package', async () => {
  const result = await runTestingHarnessExample();

  assert.equal(result.status, 'passed');
});

test('help and manifest example executes against the built package', () => {
  const { help, version, manifest } = runHelpManifestExample();

  assert.equal(help.schemaVersion, 'cli-core.help.v1');
  assert.equal(version.version, '2.0.0');
  assert.equal(manifest.schemaVersion, 'cli-core.manifest.v1');
});
