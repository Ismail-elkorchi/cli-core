import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
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

const execFileAsync = promisify(execFile);

test('README does not expose private paths', async () => {
  const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');
  const privateRepoName = ['tse', ['work', 'bench'].join('')].join('-');

  assert.equal(readme.includes(privateRepoName), false);
  assert.doesNotMatch(readme, /\/home\/ismail/i);
  assert.doesNotMatch(readme, /private\/control/);
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

test('README TypeScript snippets typecheck against the public package declarations', async () => {
  const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');
  const snippets = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((match) => match[1]);
  const directory = await mkdtemp(join(tmpdir(), 'cli-core-readme-'));

  try {
    await Promise.all(snippets.map((snippet, index) => writeFile(join(directory, `snippet-${index}.ts`), snippet, 'utf8')));
    await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
    await writeFile(join(directory, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true,
        skipLibCheck: false,
        ignoreDeprecations: '6.0',
        noEmit: true,
        baseUrl: new URL('../..', import.meta.url).pathname,
        paths: {
          '@ismail-elkorchi/cli-core': ['./dist/index.d.ts'],
          '@ismail-elkorchi/cli-core/command': ['./dist/command/public.d.ts'],
          '@ismail-elkorchi/cli-core/adapter': ['./dist/adapter/index.d.ts'],
          '@ismail-elkorchi/cli-core/completion': ['./dist/completion/index.d.ts'],
          '@ismail-elkorchi/cli-core/config': ['./dist/config/index.d.ts'],
          '@ismail-elkorchi/cli-core/effects': ['./dist/effects/index.d.ts'],
          '@ismail-elkorchi/cli-core/help': ['./dist/help/index.d.ts'],
          '@ismail-elkorchi/cli-core/manifest': ['./dist/manifest/index.d.ts'],
          '@ismail-elkorchi/cli-core/plugins': ['./dist/plugins/index.d.ts'],
          '@ismail-elkorchi/cli-core/repair': ['./dist/repair/index.d.ts'],
          '@ismail-elkorchi/cli-core/schema': ['./dist/schema/index.d.ts'],
          '@ismail-elkorchi/cli-core/testing': ['./dist/testing/index.d.ts']
        }
      },
      files: snippets.map((_snippet, index) => `snippet-${index}.ts`)
    }, null, 2), 'utf8');

    await execFileAsync('./node_modules/.bin/tsc', ['-p', directory], {
      cwd: new URL('../..', import.meta.url).pathname
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
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
  const { manifest, manifestSchema } = await runSchemaArtifactsExample();

  assert.equal(manifest.schemaVersion, 'cli-core.manifest.v1');
  assert.equal(manifestSchema.properties.schemaVersion.const, 'cli-core.manifest.v1');
});
