import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runCliMainExample } from '../../examples/cli-main.mjs';
import { runCompletionRepairExample } from '../../examples/completion-repair.mjs';
import { runConfigResolutionExample } from '../../examples/config-resolution.mjs';
import { runCommandModelExample } from '../../examples/command-model.mjs';
import { runEffectsExample } from '../../examples/effects.mjs';
import { runHelpManifestExample } from '../../examples/help-manifest.mjs';
import { runPluginsExample } from '../../examples/plugins.mjs';
import { runSchemaArtifactsExample } from '../../examples/schema-artifacts.mjs';
import { runExecutionExample } from '../../examples/run.mjs';
import { runSchemaRedactionExample } from '../../examples/schema-redaction.mjs';
import { runTestingHarnessExample } from '../../examples/testing-harness.mjs';

test('README does not expose private paths or unsupported claims', async () => {
  const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');
  const privateRepoName = ['tse', ['work', 'bench'].join('')].join('-');
  const blockedClaims = [
    ['feature', 'complete'].join('-'),
    ['drop', 'in replacement'].join('-'),
    'replaces all',
    ['front', 'ier'].join(''),
    [['press', 'ure'].join(''), ['fix', 'ture'].join('')].join(' ')
  ];

  assert.equal(readme.includes(privateRepoName), false);
  assert.doesNotMatch(readme, /\/home\/ismail/i);
  assert.doesNotMatch(readme, /private\/control/);
  for (const claim of blockedClaims) {
    assert.equal(readme.toLowerCase().includes(claim), false);
  }
});

test('README package imports correspond to exported package paths', async () => {
  const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');
  const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  const exportedPaths = new Set(Object.keys(packageJson.exports).map((key) => key === '.' ? packageJson.name : `${packageJson.name}${key.slice(1)}`));
  const importPattern = /from ['"]([^'"]+)['"]/g;

  for (const match of readme.matchAll(importPattern)) {
    const specifier = match[1];
    if (specifier?.startsWith(packageJson.name) !== true) continue;
    if (specifier?.endsWith('.json')) {
      assert.equal(exportedPaths.has(`${packageJson.name}/schemas/*.json`), true);
      continue;
    }
    assert.equal(exportedPaths.has(specifier ?? ''), true, `${specifier} is not exported`);
  }
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

test('config resolution example executes against the built package', async () => {
  const { explicit, discovered, hostDriven } = await runConfigResolutionExample();

  assert.equal(explicit.schemaVersion, 'cli-core.config-resolution.v1');
  assert.equal(explicit.values.profile, 'prod');
  assert.equal(discovered.schemaVersion, 'cli-core.config-discovery.v1');
  assert.equal(hostDriven.values.profile, 'prod');
  assert.equal(hostDriven.values.dryRun, true);
});

test('completion and repair example executes against the built package', () => {
  const { completion, bridge, command, script, installPlan, repairs } = runCompletionRepairExample();

  assert.equal(completion.schemaVersion, 'cli-core.completion.v1');
  assert.equal(bridge.schemaVersion, 'cli-core.completion-response.v1');
  assert.equal(bridge.payload.items[0].value, '--region');
  assert.equal(command.name, '__complete');
  assert.match(script.script, /complete -F/);
  assert.equal(installPlan.steps[0].action, 'write_file');
  assert.equal(repairs[0].code, 'REPAIR_UNKNOWN_COMMAND');
});

test('plugins example executes against the built package', async () => {
  const { compatibility, application, plan, run } = await runPluginsExample();

  assert.equal(compatibility.ok, true);
  assert.equal(application.program.commands.some((command) => command.path.join(' ') === 'audit'), true);
  assert.equal(plan.hooks[0].id, 'ship-audit:audit-prerun');
  assert.equal(run.ok, true);
});

test('run example executes against the built package', async () => {
  const { plan, apply } = await runExecutionExample();

  assert.equal(plan.mode, 'plan');
  assert.equal(plan.effects[0].kind, 'spawn');
  assert.equal(plan.effects[1].kind, 'plugin');
  assert.equal(apply.mode, 'apply');
  assert.equal(apply.artifacts[0].id, 'deploy-summary');
});

test('CLI adapter example executes against the built package', async () => {
  const { result, processLike } = await runCliMainExample();

  assert.equal(result.run.mode, 'plan');
  assert.equal(result.exitStatus, 0);
  assert.equal(processLike.exitCode, 0);
  assert.equal(processLike.stdout.chunks.length, 1);
});

test('effects example executes against the built package', async () => {
  const { planned, applied, memory } = await runEffectsExample();

  assert.equal(planned.mode, 'plan');
  assert.equal(planned.reports[0].status, 'planned');
  assert.equal(applied.ok, true);
  assert.equal(applied.reports[1].effect.env.SHIP_TOKEN, '[REDACTED]');
  assert.equal(memory.files()['deploy.json'], '{"ok":true}');
});

test('schema and redaction example executes against the built package', async () => {
  const { schemas, run, envelope, failure, report } = await runSchemaRedactionExample();

  assert.equal(schemas.some((schema) => schema.version === 'cli-core.run-result.v1'), true);
  assert.equal(run.effects[0].env.SHIP_TOKEN, '[REDACTED]');
  assert.equal(envelope.payloadSchemaVersion, 'cli-core.run-result.v1');
  assert.equal(failure.redacted, true);
  assert.equal(report.value.password, '[REDACTED]');
});

test('schema artifacts example executes against the built package', async () => {
  const { registry, index, manifest, manifestSchema } = await runSchemaArtifactsExample();

  assert.equal(registry.some((schema) => schema.version === 'cli-core.manifest.v1'), true);
  assert.equal(index.artifacts.some((artifact) => artifact.path === './command-manifest.schema.json'), true);
  assert.equal(manifest.schemaVersion, 'cli-core.manifest.v1');
  assert.equal(manifestSchema.properties.schemaVersion.const, 'cli-core.manifest.v1');
});
