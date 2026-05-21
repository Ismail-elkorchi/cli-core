import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runCompletionRepairExample } from '../../examples/completion-repair.mjs';
import { runConfigResolutionExample } from '../../examples/config-resolution.mjs';
import { runCommandModelExample } from '../../examples/command-model.mjs';
import { runEffectsExample } from '../../examples/effects.mjs';
import { runHelpManifestExample } from '../../examples/help-manifest.mjs';
import { runPluginsExample } from '../../examples/plugins.mjs';
import { runExecutionExample } from '../../examples/run.mjs';
import { runSchemaRedactionExample } from '../../examples/schema-redaction.mjs';
import { runTestingHarnessExample } from '../../examples/testing-harness.mjs';

test('README documents current public surface without unsupported claims', async () => {
  const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');

  assert.match(readme, /typed command-core package/);
  assert.match(readme, /API Overview/);
  assert.match(readme, /Security Model/);
  assert.match(readme, /Limitations/);
  assert.match(readme, /defineCli/);
  assert.match(readme, /resolveCliConfig/);
  assert.match(readme, /describeCli/);
  assert.match(readme, /createCompletionPayload/);
  assert.match(readme, /completeCli/);
  assert.match(readme, /suggestRepairs/);
  assert.match(readme, /createCliPluginHost/);
  assert.match(readme, /runCli/);
  assert.match(readme, /applyCliEffects/);
  assert.match(readme, /createCliSchemaEnvelope/);
  assert.match(readme, /redactCliSecrets/);
  assert.match(readme, /createCliHarness/);
  assert.doesNotMatch(readme, /feature-complete/i);
  assert.doesNotMatch(readme, /drop-in replacement/i);
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

test('config resolution example executes against the built package', () => {
  const resolution = runConfigResolutionExample();

  assert.equal(resolution.schemaVersion, 'cli-core.config-resolution.v1');
  assert.equal(resolution.values.profile, 'prod');
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
