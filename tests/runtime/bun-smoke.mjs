import * as completion from '../../dist/completion/index.js';
import * as config from '../../dist/config/index.js';
import * as help from '../../dist/help/index.js';
import * as manifest from '../../dist/manifest/index.js';
import * as plugins from '../../dist/plugins/index.js';
import * as repair from '../../dist/repair/index.js';
import * as root from '../../dist/index.js';
import * as schema from '../../dist/schema/index.js';
import * as testing from '../../dist/testing/index.js';

const program = root.defineCli(runtimeDefinition());
const invocation = root.parseCli(program, { argv: ['c', '--region', 'eu', 'api'] });
const resolved = config.resolveCliConfig(program, { env: { RUNTIME_PROFILE: 'ci' } });
const helpDocument = help.createHelpDocument(program);
const completionPayload = completion.createCompletionPayload(program, { word: 'ch' });
const manifestRoundTrip = manifest.importCommandManifest(manifest.exportCommandManifest(manifest.describeCli(program)));
const compatibility = plugins.checkCliPluginCompatibility(plugins.defineCliPluginManifest({
  name: 'runtime-plugin',
  version: '1.0.0',
  runtimes: ['node', 'deno', 'bun']
}), { runtime: 'bun' });
const repairs = repair.suggestRepairs(root.parseCli(program, { argv: ['chek'] }), program);
const run = await root.runCli(program, { mode: 'plan', invocation });
const envelope = schema.createCliSchemaEnvelope({ payloadSchemaVersion: run.schemaVersion, data: run });
const harness = testing.createCliHarness({ entrypoints: { root, schema, testing } });
const scenario = await testing.runCliScenario(harness, {
  id: 'runtime.bun.entrypoints',
  steps: [
    { kind: 'entrypoint-load', name: 'root entrypoint', entrypoint: 'root', expectedExports: ['defineCli', 'runCli'] },
    { kind: 'entrypoint-load', name: 'schema entrypoint', entrypoint: 'schema', expectedExports: ['describeCliSchemas'] },
    { kind: 'fixture-available', name: 'large fixture', fixtureId: 'commands.large-program', expectedFamily: 'commands' }
  ]
});

ensure(root.cliCorePackage.name === '@ismail-elkorchi/cli-core', 'Bun runtime could not load package root.');
ensure(invocation.ok, 'Bun runtime could not parse through root entrypoint.');
ensure(resolved.values.profile === 'ci', 'Bun runtime could not resolve config.');
ensure(helpDocument.commands[0]?.name === 'check', 'Bun runtime could not create help document.');
ensure(completionPayload.items[0]?.value === 'check', 'Bun runtime could not create completion payload.');
ensure(manifestRoundTrip.commands.some((command) => command.name === 'check'), 'Bun runtime could not round-trip manifest.');
ensure(compatibility.ok, 'Bun runtime could not check plugin compatibility.');
ensure(repairs[0]?.code === 'REPAIR_UNKNOWN_COMMAND', 'Bun runtime could not create repair suggestions.');
ensure(envelope.payloadSchemaVersion === 'cli-core.run-result.v1', 'Bun runtime could not create schema envelope.');
ensure(scenario.status === 'passed', 'Bun runtime could not run testing harness scenario.');

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
