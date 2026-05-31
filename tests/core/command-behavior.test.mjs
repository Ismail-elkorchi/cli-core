import assert from 'node:assert/strict';
import test from 'node:test';
import { createCliMain, runCliMain } from '../../dist/adapter/index.js';
import { completeCli } from '../../dist/completion/index.js';
import {
  createMemoryConfigDiscoveryHost,
  discoverCliConfigInput,
  resolveCliConfig
} from '../../dist/config/index.js';
import { createHelpDocument } from '../../dist/help/index.js';
import {
  applyCliPluginCommands,
  createCliPluginHost,
  defineCliPluginManifest
} from '../../dist/plugins/index.js';
import { createCliSchemaEnvelope } from '../../dist/schema/index.js';
import { defineCli, parseCli, runCli } from '../../dist/index.js';

test('pass-through arguments are preserved and adapter output is explicit', async () => {
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
});

test('completion returns options scoped to the active command', () => {
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
  const completion = completeCli(program, { words: ['tasks', '__complete', 'run', '--f'] });

  assert.equal(completion.payload.items.some((item) => item.value === '--force'), true);
  assert.equal(completion.payload.items.some((item) => item.value === '--verbose'), false);
});

test('plugin command contributions apply before parse and hook effects enter run results', async () => {
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
          record: (context) => ({ effects: [{ kind: 'audit.record', payload: { event: context.event } }] }),
          finish: (context) => ({ effects: [{ kind: 'audit.finish', payload: { event: context.event } }] })
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
});

test('nested command aliases and schema envelopes stay explicit', () => {
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
    payload: invocation
  });

  assert.equal(invocation.ok, true);
  assert.deepEqual(invocation.commandPath, ['project', 'install']);
  assert.equal(invocation.usedAlias?.token, 'i');
  assert.equal(envelope.payloadSchemaVersion, 'cli-core.invocation.v1');
});

test('variadic positionals bind without implicit default-command routing', () => {
  const program = defineCli({
    name: 'builder',
    commands: [
      {
        name: 'build',
        options: [
          { name: 'envSecret', type: 'string', flags: ['--env-secret'] },
          { name: 'minimize', type: 'boolean', flags: ['--minimize'] }
        ],
        positionals: [{ name: 'files', variadic: true }]
      }
    ]
  });
  const invocation = parseCli(program, {
    argv: ['build', 'entry.ts', 'extra.ts', '--env-secret', 'token', '--minimize']
  });
  const defaultAttempt = parseCli(program, { argv: ['entry.ts'] });

  assert.equal(invocation.ok, true);
  assert.deepEqual(invocation.positionals.files, ['entry.ts', 'extra.ts']);
  assert.equal(invocation.options.values.envSecret, 'token');
  assert.equal(invocation.options.values.minimize, true);
  assert.equal(defaultAttempt.ok, false);
  assert.equal(defaultAttempt.diagnostics[0].code, 'CLI_UNKNOWN_COMMAND');
});

test('environment capture is explicit through config discovery hosts', async () => {
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
  const completion = completeCli(program, { words: ['server', '__complete', 'serve', '--p'] });

  assert.equal(config.values.debug, true);
  assert.equal(config.entries[0].source.kind, 'environment');
  assert.equal(completion.payload.items.some((item) => item.value === '--port'), true);
});

test('CLI main writes only through the supplied host', async () => {
  const program = defineCli({ name: 'ship', commands: [{ name: 'status' }] });
  const stdout = [];
  const stderr = [];
  const main = createCliMain({ program, mode: 'plan' });
  const result = await main({
    argv: ['status'],
    writeStdout: (text) => { stdout.push(text); },
    writeStderr: (text) => { stderr.push(text); },
    setExitCode: () => {}
  });

  assert.equal(result.exitStatus, 0);
  assert.equal(stdout.length, 1);
  assert.equal(stderr.length, 0);
});
