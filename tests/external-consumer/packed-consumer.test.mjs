import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

test('packed package installs and runs from an outside Node consumer', async (context) => {
  const workspace = await mkdtemp(join(tmpdir(), 'cli-core-consumer-'));
  context.after(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  const pack = await packPackage(workspace);
  assertPackageFiles(pack.files);

  await writeFile(join(workspace, 'package.json'), `${JSON.stringify({
    name: 'cli-core-packed-consumer',
    private: true,
    type: 'module'
  }, null, 2)}\n`);
  await execFileAsync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(workspace, pack.filename)], {
    cwd: workspace
  });
  await writeFile(join(workspace, 'consumer.mjs'), consumerScenarioSource());

  const { stdout } = await execFileAsync(process.execPath, ['consumer.mjs'], {
    cwd: workspace
  });
  const result = JSON.parse(stdout);

  assert.equal(result.packageName, '@ismail-elkorchi/cli-core');
  assert.equal(result.invocationOk, true);
  assert.equal(result.configProfile, 'ci');
  assert.equal(result.helpCommand, 'deploy');
  assert.equal(result.manifestHasPluginCommand, true);
  assert.equal(result.completionCandidate, 'audit');
  assert.equal(result.repairCode, 'REPAIR_UNKNOWN_COMMAND');
  assert.equal(result.runOk, true);
  assert.equal(result.mainExitStatus, 0);
  assert.equal(result.effectReportOk, true);
  assert.equal(result.redactedToken, '[REDACTED]');
  assert.equal(result.harnessStatus, 'passed');
  assert.equal(result.schemaArtifactsIncludeManifest, true);
});

test('packed package can be imported by Bun from an outside consumer when Bun is available', async (context) => {
  if (!(await commandAvailable('bun'))) {
    context.skip('bun is not available in this environment');
    return;
  }

  const workspace = await mkdtemp(join(tmpdir(), 'cli-core-bun-consumer-'));
  context.after(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  const pack = await packPackage(workspace);
  await writeFile(join(workspace, 'package.json'), `${JSON.stringify({
    name: 'cli-core-packed-bun-consumer',
    private: true,
    type: 'module'
  }, null, 2)}\n`);
  await execFileAsync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(workspace, pack.filename)], {
    cwd: workspace
  });
  await writeFile(join(workspace, 'consumer-bun.mjs'), bunConsumerSource());

  const { stdout } = await execFileAsync('bun', ['consumer-bun.mjs'], {
    cwd: workspace
  });
  const result = JSON.parse(stdout);

  assert.equal(result.packageName, '@ismail-elkorchi/cli-core');
  assert.equal(result.invocationOk, true);
  assert.equal(result.completionCandidate, 'check');
  assert.equal(result.runSchemaVersion, 'cli-core.run-result.v1');
  assert.equal(result.mainExitStatus, 0);
});

async function packPackage(destination) {
  const { stdout } = await execFileAsync('npm', ['pack', '--json', '--pack-destination', destination], {
    cwd: repoRoot
  });
  const [pack] = JSON.parse(stdout);
  return pack;
}

function assertPackageFiles(files) {
  const paths = new Set(files.map((file) => file.path));
  const joined = [...paths].join('\n');

  assert.equal(paths.has('package.json'), true);
  assert.equal(paths.has('dist/index.js'), true);
  assert.equal(paths.has('dist/adapter/index.js'), true);
  assert.equal(paths.has('dist/completion/index.js'), true);
  assert.equal(paths.has('dist/config/index.js'), true);
  assert.equal(paths.has('dist/effects/index.js'), true);
  assert.equal(paths.has('dist/help/index.js'), true);
  assert.equal(paths.has('dist/manifest/index.js'), true);
  assert.equal(paths.has('dist/plugins/index.js'), true);
  assert.equal(paths.has('dist/repair/index.js'), true);
  assert.equal(paths.has('dist/schema/index.js'), true);
  assert.equal(paths.has('dist/testing/index.js'), true);
  assert.equal(paths.has('schemas/index.json'), true);
  assert.equal(paths.has('schemas/command-manifest.schema.json'), true);
  assert.equal([...paths].some((path) => path.startsWith('/') || path.includes('..')), false);
  assert.equal(joined.includes('node_modules/'), false);
}

async function commandAvailable(command) {
  try {
    await execFileAsync(command, ['--version']);
    return true;
  } catch {
    return false;
  }
}

function consumerScenarioSource() {
  return `
import * as assert from 'node:assert/strict';
import * as root from '@ismail-elkorchi/cli-core';
import * as adapter from '@ismail-elkorchi/cli-core/adapter';
import * as completion from '@ismail-elkorchi/cli-core/completion';
import * as config from '@ismail-elkorchi/cli-core/config';
import * as effects from '@ismail-elkorchi/cli-core/effects';
import * as help from '@ismail-elkorchi/cli-core/help';
import * as manifest from '@ismail-elkorchi/cli-core/manifest';
import * as plugins from '@ismail-elkorchi/cli-core/plugins';
import * as repair from '@ismail-elkorchi/cli-core/repair';
import * as schema from '@ismail-elkorchi/cli-core/schema';
import * as testing from '@ismail-elkorchi/cli-core/testing';
import schemaIndex from '@ismail-elkorchi/cli-core/schemas' with { type: 'json' };
import manifestSchema from '@ismail-elkorchi/cli-core/schemas/command-manifest.schema.json' with { type: 'json' };

const baseProgram = root.defineCli({
  name: 'ship',
  config: {
    fields: [{ name: 'profile', type: 'string', default: 'local', env: 'SHIP_PROFILE' }]
  },
  commands: [
    {
      name: 'deploy',
      aliases: ['d'],
      options: [{ name: 'region', type: 'string', flags: ['--region'] }],
      positionals: [{ name: 'service', required: true }]
    }
  ]
});
const pluginManifest = plugins.defineCliPluginManifest({
  name: 'ship-audit',
  version: '1.0.0',
  capabilities: ['audit'],
  commands: [{ name: 'audit', aliases: ['a'], description: 'Inspect deployment history.' }]
});
const pluginApplication = plugins.applyCliPluginCommands(baseProgram, [pluginManifest], {
  allowedCapabilities: ['audit']
});
const program = pluginApplication.program;
const invocation = root.parseCli(program, { argv: ['deploy', '--region', 'eu', 'api'] });
const memoryConfig = config.createMemoryConfigDiscoveryHost({ env: { SHIP_PROFILE: 'ci' } });
const discovered = await config.discoverCliConfigInput(program, {
  host: memoryConfig.host,
  scope: 'none',
  environment: { includeConfigFields: true }
});
const resolved = config.resolveCliConfig(program, discovered.input);
const helpDocument = help.createHelpDocument(program);
const manifestDocument = manifest.importCommandManifest(manifest.exportCommandManifest(manifest.describeCli(program)));
const completionResponse = completion.completeCli(program, { words: ['ship', '__complete', 'a'], cursor: 3 });
const repairs = repair.suggestRepairs(root.parseCli(program, { argv: ['audt'] }), program);
const run = await root.runCli(program, {
  mode: 'apply',
  invocation,
  handlers: {
    deploy: () => ({
      artifacts: [{ id: 'summary', kind: 'json', payload: { service: 'api' } }],
      effects: [{ kind: 'write_file', path: 'deploy.json', content: '{"ok":true}' }]
    })
  }
});
const main = await adapter.runCliMain({
  program,
  mode: 'plan',
  argv: ['deploy', '--region', 'eu', 'api'],
  handlers: {
    deploy: () => ({
      artifacts: [{ id: 'main-summary', kind: 'json', payload: { service: 'api' } }]
    })
  }
});
const memoryEffects = effects.createMemoryEffectHost();
const effectReport = await effects.applyCliEffects({
  effects: run.effects,
  host: memoryEffects.host,
  policy: { allowWriteFile: true }
});
const redaction = schema.redactCliSecretsWithReport({ token: 'secret-token', visible: true });
const harness = testing.createCliHarness({ entrypoints: { root, adapter, testing, schema } });
const scenario = await testing.runCliScenario(harness, {
  id: 'external.consumer.vertical',
  steps: [
    { kind: 'entrypoint-load', name: 'root entrypoint', entrypoint: 'root', expectedExports: ['defineCli', 'runCli'] },
    { kind: 'entrypoint-load', name: 'adapter entrypoint', entrypoint: 'adapter', expectedExports: ['runCliMain'] },
    { kind: 'entrypoint-load', name: 'testing entrypoint', entrypoint: 'testing', expectedExports: ['createCliHarness', 'runCliScenario'] },
    { kind: 'fixture-available', name: 'large fixture', fixtureId: 'commands.large-program', expectedFamily: 'commands' }
  ]
});

assert.equal(pluginApplication.ok, true);
assert.equal(schemaIndex.artifacts.some((artifact) => artifact.path === './command-manifest.schema.json'), true);
assert.equal(manifestSchema.properties.schemaVersion.const, 'cli-core.manifest.v1');

console.log(JSON.stringify({
  packageName: root.cliCorePackage.name,
  invocationOk: invocation.ok,
  configProfile: resolved.values.profile,
  helpCommand: helpDocument.commands[0]?.name,
  manifestHasPluginCommand: manifestDocument.commands.some((command) => command.name === 'audit'),
  completionCandidate: completionResponse.payload.items[0]?.value,
  repairCode: repairs[0]?.code,
  runOk: run.ok,
  mainExitStatus: main.exitStatus,
  effectReportOk: effectReport.ok,
  redactedToken: redaction.value.token,
  harnessStatus: scenario.status,
  schemaArtifactsIncludeManifest: schemaIndex.artifacts.some((artifact) => artifact.version === 'cli-core.manifest.v1')
}));
`;
}

function bunConsumerSource() {
  return `
import * as root from '@ismail-elkorchi/cli-core';
import * as adapter from '@ismail-elkorchi/cli-core/adapter';
import * as completion from '@ismail-elkorchi/cli-core/completion';
import * as config from '@ismail-elkorchi/cli-core/config';
import * as schema from '@ismail-elkorchi/cli-core/schema';

const program = root.defineCli({
  name: 'ship',
  config: { fields: [{ name: 'profile', type: 'string', default: 'local', env: 'SHIP_PROFILE' }] },
  commands: [{ name: 'check', aliases: ['c'], positionals: [{ name: 'target' }] }]
});
const invocation = root.parseCli(program, { argv: ['c', 'api'] });
const memory = config.createMemoryConfigDiscoveryHost({ env: { SHIP_PROFILE: 'ci' } });
const discovered = await config.discoverCliConfigInput(program, {
  host: memory.host,
  scope: 'none',
  environment: { includeConfigFields: true }
});
const resolved = config.resolveCliConfig(program, discovered.input);
const completions = completion.completeCli(program, { words: ['ship', 'ch'], cursor: 2 });
const run = await root.runCli(program, { mode: 'plan', invocation });
const main = await adapter.runCliMain({ program, mode: 'plan', argv: ['check', 'api'] });
const envelope = schema.createCliSchemaEnvelope({ payloadSchemaVersion: run.schemaVersion, payload: run });

console.log(JSON.stringify({
  packageName: root.cliCorePackage.name,
  invocationOk: invocation.ok && resolved.values.profile === 'ci',
  completionCandidate: completions.payload.items[0]?.value,
  runSchemaVersion: envelope.payloadSchemaVersion,
  mainExitStatus: main.exitStatus
}));
`;
}
