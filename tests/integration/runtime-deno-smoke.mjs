import * as adapter from '../../src/adapter/index.ts';
import * as completion from '../../src/completion/index.ts';
import * as config from '../../src/config/index.ts';
import * as effects from '../../src/effects/index.ts';
import * as help from '../../src/help/index.ts';
import * as manifest from '../../src/manifest/index.ts';
import * as plugins from '../../src/plugins/index.ts';
import * as repair from '../../src/repair/index.ts';
import * as root from '../../src/index.ts';
import * as schema from '../../src/schema/index.ts';
import * as testing from '../../src/testing/index.ts';
import { bindTestOptions } from '../support/invocation-parser.mjs';

Deno.test('Deno can load and exercise cli-core source entrypoints', async () => {
  const parser = root.createCliInvocationParser(bindTestOptions);
  const program = root.defineCli(runtimeDefinition());
  const invocation = parser.parse(program, { argv: ['c', '--region', 'eu', 'api'] });
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
  }), { runtime: 'deno' });
  const repairs = repair.createRepairSuggestionResult(parser.parse(program, { argv: ['chek'] }), program).suggestions;
  const run = await root.runCli(program, { mode: 'plan', invocation });
  const main = await adapter.runCliMain({ program, parser, mode: 'plan', argv: ['check', 'api'] });
  const memoryHost = effects.createMemoryEffectHost();
  const effectReport = await effects.applyCliEffects({
    effects: [{ kind: 'write_file', path: 'runtime.txt', content: 'ok' }],
    host: memoryHost.host,
    policy: { allowWriteFile: true }
  });
  const envelope = schema.createCliSchemaEnvelope({ payloadSchemaVersion: run.schemaVersion, payload: run });
  const harness = testing.createCliHarness({ entrypoints: { root, adapter, schema, testing } });
  const scenario = await testing.runCliScenario(harness, {
    id: 'runtime.deno.entrypoints',
    steps: [
      { kind: 'entrypoint-load', name: 'root entrypoint', entrypoint: 'root', expectedExports: ['defineCli', 'runCli'] },
      { kind: 'entrypoint-load', name: 'adapter entrypoint', entrypoint: 'adapter', expectedExports: ['runCliMain'] },
      { kind: 'entrypoint-load', name: 'schema entrypoint', entrypoint: 'schema', expectedExports: ['describeCliSchemas'] },
      { kind: 'entrypoint-load', name: 'testing entrypoint', entrypoint: 'testing', expectedExports: ['createCliHarness', 'runCliScenario'] }
    ]
  });

  ensure(root.cliCorePackage.name === '@ismail-elkorchi/cli-core', 'Deno runtime could not load package root.');
  ensure(invocation.ok, 'Deno runtime could not parse through root entrypoint.');
  ensure(discoveredConfig.ok, 'Deno runtime could not discover config input.');
  ensure(resolved.values.profile === 'ci', 'Deno runtime could not resolve config.');
  ensure(helpDocument.commands[0]?.name === 'check', 'Deno runtime could not create help document.');
  ensure(completionPayload.items[0]?.value === 'check', 'Deno runtime could not create completion payload.');
  ensure(completionBridge.payload.items[0]?.value === 'check', 'Deno runtime could not use completion bridge.');
  ensure(manifestRoundTrip.commands.some((command) => command.name === 'check'), 'Deno runtime could not round-trip manifest.');
  ensure(compatibility.ok, 'Deno runtime could not check plugin compatibility.');
  ensure(repairs[0]?.code === 'REPAIR_UNKNOWN_COMMAND', 'Deno runtime could not create repair suggestions.');
  ensure(effectReport.ok, 'Deno runtime could not apply memory effects.');
  ensure(main.exitStatus === 0, 'Deno runtime could not use CLI adapter.');
  ensure(memoryHost.files()['runtime.txt'] === 'ok', 'Deno runtime memory effect host did not record a file.');
  ensure(envelope.payloadSchemaVersion === 'cli-core.run-result.v1', 'Deno runtime could not create schema envelope.');
  ensure(scenario.status === 'passed', 'Deno runtime could not run testing harness scenario.');
});

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

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
