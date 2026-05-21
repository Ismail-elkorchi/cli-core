import assert from 'node:assert/strict';
import test from 'node:test';
import * as adapter from '../../dist/adapter/index.js';
import * as completion from '../../dist/completion/index.js';
import * as config from '../../dist/config/index.js';
import * as effects from '../../dist/effects/index.js';
import * as help from '../../dist/help/index.js';
import * as manifest from '../../dist/manifest/index.js';
import * as plugins from '../../dist/plugins/index.js';
import * as repair from '../../dist/repair/index.js';
import * as root from '../../dist/index.js';
import * as schema from '../../dist/schema/index.js';
import * as testing from '../../dist/testing/index.js';

test('node runtime can load and exercise public entrypoints', async () => {
  const program = root.defineCli(runtimeDefinition());
  const invocation = root.parseCli(program, { argv: ['c', '--region', 'eu', 'api'] });
  const memoryConfig = config.createMemoryConfigDiscoveryHost({ env: { RUNTIME_PROFILE: 'ci' } });
  const discoveredConfig = await config.discoverCliConfigInput(program, {
    host: memoryConfig.host,
    scope: 'none',
    environment: { includeConfigFields: true }
  });
  const resolved = config.resolveCliConfig(program, discoveredConfig.input);
  const helpDocument = help.createHelpDocument(program);
  const completionPayload = completion.createCompletionPayload(program, { word: 'ch' });
  const completionBridge = completion.completeCli(program, { words: ['runtime', 'ch'], cursor: 2 });
  const manifestRoundTrip = manifest.importCommandManifest(manifest.exportCommandManifest(manifest.describeCli(program)));
  const compatibility = plugins.checkCliPluginCompatibility(plugins.defineCliPluginManifest({
    name: 'runtime-plugin',
    version: '1.0.0',
    runtimes: ['node', 'deno', 'bun']
  }), { runtime: 'node' });
  const repairs = repair.suggestRepairs(root.parseCli(program, { argv: ['chek'] }), program);
  const run = await root.runCli(program, { mode: 'plan', invocation });
  const main = await adapter.runCliMain({ program, mode: 'plan', argv: ['check', 'api'] });
  const memoryHost = effects.createMemoryEffectHost();
  const effectReport = await effects.applyCliEffects({
    effects: [{ kind: 'write_file', path: 'runtime.txt', content: 'ok' }],
    host: memoryHost.host,
    policy: { allowWriteFile: true }
  });
  const envelope = schema.createCliSchemaEnvelope({ payloadSchemaVersion: run.schemaVersion, data: run });
  const harness = testing.createCliHarness({ entrypoints: { root, adapter, schema, testing } });
  const scenario = await testing.runCliScenario(harness, {
    id: 'runtime.node.entrypoints',
    steps: [
      { kind: 'entrypoint-load', name: 'root entrypoint', entrypoint: 'root', expectedExports: ['defineCli', 'runCli'] },
      { kind: 'entrypoint-load', name: 'adapter entrypoint', entrypoint: 'adapter', expectedExports: ['runCliMain'] },
      { kind: 'entrypoint-load', name: 'schema entrypoint', entrypoint: 'schema', expectedExports: ['describeCliSchemas'] },
      { kind: 'fixture-available', name: 'large fixture', fixtureId: 'commands.large-program', expectedFamily: 'commands' }
    ]
  });

  assert.equal(root.cliCorePackage.name, '@ismail-elkorchi/cli-core');
  assert.equal(invocation.ok, true);
  assert.equal(discoveredConfig.ok, true);
  assert.equal(resolved.values.profile, 'ci');
  assert.equal(helpDocument.commands[0].name, 'check');
  assert.equal(completionPayload.items[0].value, 'check');
  assert.equal(completionBridge.payload.items[0].value, 'check');
  assert.equal(manifestRoundTrip.commands.some((command) => command.name === 'check'), true);
  assert.equal(compatibility.ok, true);
  assert.equal(repairs[0].code, 'REPAIR_UNKNOWN_COMMAND');
  assert.equal(effectReport.ok, true);
  assert.equal(main.exitStatus, 0);
  assert.equal(memoryHost.files()['runtime.txt'], 'ok');
  assert.equal(envelope.payloadSchemaVersion, 'cli-core.run-result.v1');
  assert.equal(schema.describeCliSchemas().some((item) => item.version === 'cli-core.schema-envelope.v1'), true);
  assert.equal(scenario.status, 'passed');
});

function runtimeDefinition() {
  return {
    name: 'runtime',
    config: {
      fields: [{ name: 'profile', type: 'string', default: 'local', env: 'RUNTIME_PROFILE' }]
    },
    commands: [
      {
        name: 'check',
        aliases: ['c'],
        options: [{ name: 'region', type: 'string', flags: ['--region'] }],
        positionals: [{ name: 'target' }]
      }
    ]
  };
}
