import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCliPluginCommands,
  completeCli,
  createCliPluginHost,
  createCliSchemaEnvelope,
  createHelpDocument,
  createMemoryConfigDiscoveryHost,
  defineCli,
  defineCliPluginManifest,
  describeCli,
  discoverCliConfigInput,
  parseCli,
  resolveCliConfig,
  runCli,
  runCliMain
} from '../../dist/index.js';
import { frontierPressureCases } from './frontier-pressure-cases.mjs';

const requiredCompetitors = ['Commander', 'Yargs', 'oclif', 'Clipanion', 'CAC', 'Cliffy'];
const requiredFrontierAreas = [
  'plugin-command-application',
  'plugin-lifecycle',
  'effect-application',
  'completion-bridge',
  'config-discovery',
  'schema-artifacts',
  'packed-consumer',
  'large-scale',
  'competitor-pressure',
  'cli-adapter',
  'api-hardening'
];

test('frontier pressure cases cover every required competitor and capability area', () => {
  const competitors = new Set(frontierPressureCases.map((item) => item.competitor));
  const frontierAreas = new Set(frontierPressureCases.flatMap((item) => item.frontierAreas));

  for (const competitor of requiredCompetitors) {
    assert.equal(competitors.has(competitor), true, `${competitor} pressure case is missing`);
  }
  for (const frontierArea of requiredFrontierAreas) {
    assert.equal(frontierAreas.has(frontierArea), true, `${frontierArea} pressure coverage is missing`);
  }
});

test('frontier pressure cases keep source and product decisions explicit', () => {
  for (const item of frontierPressureCases) {
    assert.match(item.id, /^[a-z0-9-]+$/);
    assert.match(item.sourceUrl, /^https:\/\//);
    assert.ok(item.pressure.length > 40);
    assert.ok(item.cliCoreDecision.length > 40);
    assert.ok(item.affectedSurface.length > 0);
    assert.ok(item.frontierAreas.length > 0);
    assert.ok(item.assertions.length > 0);
    for (const unsupported of item.unsupportedCases ?? []) {
      assert.ok(unsupported.length > 10);
    }
  }
});

const pressureAssertions = {
  async 'commander-pass-through-help-exit'() {
    const program = defineCli({
      name: 'proxy',
      commands: [{ name: 'exec', allowPassThrough: true, positionals: [{ name: 'script' }] }]
    });
    const invocation = parseCli(program, { argv: ['exec', 'build.js', '--', '--remote', 'prod'] });
    const help = createHelpDocument(program, ['exec']);
    const plan = await runCli(program, {
      mode: 'plan',
      invocation,
      effects: [{ kind: 'spawn', command: 'proxy', argv: ['exec', 'build.js', '--remote', 'prod'] }]
    });
    const main = await runCliMain({
      program,
      mode: 'plan',
      argv: ['exec', 'build.js', '--', '--remote', 'prod']
    });

    assert.equal(invocation.ok, true);
    assert.deepEqual(invocation.passThrough, ['--remote', 'prod']);
    assert.equal(help.commandPath.join(' '), 'exec');
    assert.equal(plan.exitKind, 'ok');
    assert.equal(plan.effects[0].kind, 'spawn');
    assert.equal(main.exitStatus, 0);
    assert.match(main.rendered.stdout, /command exec/);
  },

  'yargs-command-groups-completion'() {
    const program = defineCli({
      name: 'tasks',
      options: [{ name: 'verbose', type: 'boolean', flags: ['--verbose', '-v'] }],
      commands: [
        {
          name: 'run',
          options: [{ name: 'force', type: 'boolean', flags: ['--force', '-f'] }],
          positionals: [{ name: 'task' }]
        }
      ]
    });
    const manifest = describeCli(program);
    const completion = completeCli(program, { words: ['tasks', '__complete', 'run', '--f'] });
    const run = manifest.commands.find((command) => command.path.join(' ') === 'run');

    assert.equal(completion.payload.items.some((item) => item.value === '--force'), true);
    assert.equal(run?.options.some((option) => option.name === 'force'), true);
    assert.equal(run?.inheritedOptions.some((option) => option.name === 'verbose'), true);
  },

  async 'oclif-plugin-hooks'() {
    const manifest = defineCliPluginManifest({
      name: 'tasks-audit',
      version: '1.0.0',
      capabilities: ['audit'],
      commands: [{ name: 'audit', description: 'Inspect task history.' }],
      hooks: [{ name: 'record', event: 'prerun' }, { name: 'finish', event: 'postrun' }]
    });
    const application = applyCliPluginCommands({ name: 'tasks', commands: [{ name: 'run' }] }, [manifest], {
      allowedCapabilities: ['audit']
    });
    const pluginHost = createCliPluginHost([
      {
        manifest,
        load: () => ({
          manifest,
          hooks: {
            record: (context) => ({ effects: [{ kind: 'audit.record', data: { event: context.event } }] }),
            finish: (context) => ({ effects: [{ kind: 'audit.finish', data: { event: context.event } }] })
          }
        })
      }
    ], { allowedCapabilities: ['audit'] });
    const invocation = parseCli(application.program, { argv: ['audit'] });
    const result = await runCli(application.program, { mode: 'plan', invocation, pluginHost });

    assert.equal(application.diagnostics.length, 0);
    assert.equal(invocation.ok, true);
    assert.equal(result.effects.some((effect) => effect.kind === 'plugin' && effect.pluginName === 'tasks-audit'), true);
    assert.equal(result.events.some((event) => event.name === 'plugin.hooks.planned'), true);
  },

  'clipanion-state-machine'() {
    const program = defineCli({
      name: 'workspace',
      commands: [
        {
          name: 'project',
          commands: [{ name: 'install', aliases: ['i'], options: [{ name: 'immutable', type: 'boolean', flags: ['--immutable'] }] }]
        }
      ]
    });
    const invocation = parseCli(program, { argv: ['project', 'i', '--immutable'] });
    const envelope = createCliSchemaEnvelope({
      payloadSchemaVersion: invocation.schemaVersion,
      data: invocation
    });

    assert.equal(invocation.ok, true);
    assert.deepEqual(invocation.commandPath, ['project', 'install']);
    assert.equal(invocation.usedAlias?.token, 'i');
    assert.equal(envelope.payloadSchemaVersion, 'cli-core.invocation.v1');
  },

  'cac-default-variadic-nested-options'() {
    const program = defineCli({
      name: 'builder',
      commands: [
        {
          name: 'build',
          options: [
            { name: 'envSecret', type: 'string', flags: ['--env.API_SECRET'] },
            { name: 'minimize', type: 'boolean', flags: ['--minimize'] }
          ],
          positionals: [{ name: 'files', variadic: true }]
        }
      ]
    });
    const invocation = parseCli(program, {
      argv: ['build', 'entry.ts', 'extra.ts', '--env.API_SECRET', 'token', '--minimize']
    });
    const defaultAttempt = parseCli(program, { argv: ['entry.ts'] });

    assert.equal(invocation.ok, true);
    assert.deepEqual(invocation.positionals.files, ['entry.ts', 'extra.ts']);
    assert.equal(invocation.options.values.envSecret, 'token');
    assert.equal(invocation.options.values.minimize, true);
    assert.equal(defaultAttempt.ok, false);
    assert.equal(defaultAttempt.diagnostics[0].code, 'CLI_UNKNOWN_COMMAND');
  },

  async 'cliffy-help-completion-env'() {
    const program = defineCli({
      name: 'server',
      config: { fields: [{ name: 'debug', type: 'boolean', default: false, env: 'DEBUG' }] },
      commands: [{ name: 'serve', options: [{ name: 'port', type: 'number', flags: ['--port'] }] }]
    });
    const memory = createMemoryConfigDiscoveryHost({ env: { DEBUG: '1' } });
    const discovered = await discoverCliConfigInput(program, {
      host: memory.host,
      scope: 'none',
      environment: { includeConfigFields: true }
    });
    const config = resolveCliConfig(program, discovered.input);
    const help = createHelpDocument(program, ['serve']);
    const completion = completeCli(program, { words: ['server', '__complete', 'serve', '--p'] });

    assert.equal(config.values.debug, true);
    assert.equal(config.entries[0].source.kind, 'environment');
    assert.equal(help.commandPath.join(' '), 'serve');
    assert.equal(completion.payload.items.some((item) => item.value === '--port'), true);
  }
};

for (const item of frontierPressureCases) {
  test(`frontier pressure case executes cli-core decision: ${item.id}`, async () => {
    await pressureAssertions[item.id]();
  });
}
