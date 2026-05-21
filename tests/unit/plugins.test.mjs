import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCliPluginCommands,
  checkCliPluginCompatibility,
  createCliPluginHost,
  defineCliPluginManifest
} from '../../dist/index.js';

test('checkCliPluginCompatibility reports version and runtime mismatches as diagnostics', () => {
  const version = checkCliPluginCompatibility({
    name: 'future',
    version: '1.0.0',
    cliCore: { minVersion: '99.0.0' }
  });
  const runtime = checkCliPluginCompatibility({
    name: 'node-only',
    version: '1.0.0',
    runtimes: ['node']
  }, { runtime: 'deno' });

  assert.equal(version.ok, false);
  assert.equal(version.diagnostics[0].code, 'CLI_PLUGIN_CORE_VERSION_UNSUPPORTED');
  assert.equal(runtime.ok, false);
  assert.equal(runtime.diagnostics[0].code, 'CLI_PLUGIN_RUNTIME_UNSUPPORTED');
});

test('createCliPluginHost keeps plugin modules lazy until load or hook execution', async () => {
  let loads = 0;
  const manifest = defineCliPluginManifest({
    name: 'audit',
    version: '1.0.0',
    hooks: [{ name: 'audit-prerun', event: 'prerun' }]
  });
  const host = createCliPluginHost([
    {
      manifest,
      load() {
        loads += 1;
        return {
          manifest,
          hooks: {
            'audit-prerun': () => ({ effects: [{ kind: 'audit.record', payload: { ok: true } }] })
          }
        };
      }
    }
  ]);

  assert.equal(loads, 0);
  assert.equal(host.manifests[0].name, 'audit');

  const result = await host.runHooks('prerun');

  assert.equal(loads, 1);
  assert.equal(result.ok, true);
  assert.equal(result.hooks[0].effects[0].kind, 'audit.record');
});

test('planHooks orders hooks with before and after constraints', () => {
  const host = createCliPluginHost([
    {
      manifest: {
        name: 'first',
        version: '1.0.0',
        hooks: [{ name: 'prepare', event: 'prerun', before: ['second:observe'] }]
      },
      load: () => ({ hooks: {} })
    },
    {
      manifest: {
        name: 'second',
        version: '1.0.0',
        hooks: [{ name: 'observe', event: 'prerun' }]
      },
      load: () => ({ hooks: {} })
    }
  ]);

  assert.deepEqual(host.planHooks('prerun').hooks.map((hook) => hook.id), ['first:prepare', 'second:observe']);
});

test('runHooks isolates loader and hook faults as plugin diagnostics', async () => {
  const hookFailureManifest = defineCliPluginManifest({
    name: 'hook-failure',
    version: '1.0.0',
    hooks: [{ name: 'explode', event: 'prerun' }]
  });
  const host = createCliPluginHost([
    {
      manifest: { name: 'loader-failure', version: '1.0.0', hooks: [{ name: 'load', event: 'prerun' }] },
      load: () => {
        throw new Error('loader failed');
      }
    },
    {
      manifest: hookFailureManifest,
      load: () => ({
        manifest: hookFailureManifest,
        hooks: {
          explode: () => {
            throw new Error('hook failed');
          }
        }
      })
    }
  ]);

  const result = await host.runHooks('prerun');

  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    'CLI_PLUGIN_LOAD_FAILED',
    'CLI_PLUGIN_HOOK_FAILED'
  ]);
  assert.deepEqual(result.hooks.map((hook) => hook.status), ['failed', 'failed']);
});

test('planHooks reports ordering cycles without loading plugins', () => {
  let loads = 0;
  const host = createCliPluginHost([
    {
      manifest: {
        name: 'a',
        version: '1.0.0',
        hooks: [{ name: 'one', event: 'init', after: ['b:two'] }]
      },
      load: () => {
        loads += 1;
        return {};
      }
    },
    {
      manifest: {
        name: 'b',
        version: '1.0.0',
        hooks: [{ name: 'two', event: 'init', after: ['a:one'] }]
      },
      load: () => {
        loads += 1;
        return {};
      }
    }
  ]);
  const plan = host.planHooks('init');

  assert.equal(plan.diagnostics[0].code, 'CLI_PLUGIN_HOOK_ORDER_CYCLE');
  assert.equal(loads, 0);
});

test('applyCliPluginCommands adds compatible manifest commands without loading plugin code', () => {
  const application = applyCliPluginCommands({
    name: 'ship',
    commands: [{ name: 'status' }]
  }, [
    {
      name: 'ship-audit',
      version: '1.0.0',
      commands: [
        {
          name: 'audit',
          aliases: ['a'],
          options: [{ name: 'json', type: 'boolean', flags: ['--json'] }]
        }
      ]
    }
  ]);

  assert.equal(application.ok, true);
  assert.equal(application.program.commands.some((command) => command.path.join(' ') === 'audit'), true);
  const command = application.program.commands.find((candidate) => candidate.path.join(' ') === 'audit');
  assert.equal(command.source.kind, 'plugin');
  assert.equal(command.source.pluginName, 'ship-audit');
  assert.deepEqual(application.contributions[0].commandPaths, [['audit']]);
  assert.deepEqual(application.contributions[0].aliasPaths, [['a']]);
});

test('applyCliPluginCommands rejects incompatible plugin commands before they reach the program', () => {
  const application = applyCliPluginCommands({
    name: 'ship',
    commands: [{ name: 'status' }]
  }, [
    {
      name: 'future-audit',
      version: '1.0.0',
      cliCore: { minVersion: '99.0.0' },
      commands: [{ name: 'audit' }]
    }
  ]);

  assert.equal(application.ok, false);
  assert.equal(application.program.commands.some((command) => command.path.join(' ') === 'audit'), false);
  assert.equal(application.diagnostics.some((diagnostic) => diagnostic.code === 'CLI_PLUGIN_COMMAND_REJECTED'), true);
});

test('applyCliPluginCommands rejects duplicate plugin command paths and aliases', () => {
  const application = applyCliPluginCommands({
    name: 'ship',
    commands: [{ name: 'status', aliases: ['st'] }]
  }, [
    { name: 'duplicate-path', version: '1.0.0', commands: [{ name: 'status' }] },
    { name: 'duplicate-alias', version: '1.0.0', commands: [{ name: 'audit', aliases: ['st'] }] }
  ]);

  assert.equal(application.ok, false);
  assert.equal(application.program.commands.filter((command) => command.path.join(' ') === 'status').length, 1);
  assert.equal(application.program.commands.some((command) => command.path.join(' ') === 'audit'), false);
  assert.deepEqual(application.diagnostics.map((diagnostic) => diagnostic.code), [
    'CLI_PLUGIN_COMMAND_CONFLICT',
    'CLI_PLUGIN_COMMAND_CONFLICT'
  ]);
});
