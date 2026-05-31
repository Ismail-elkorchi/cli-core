import assert from 'node:assert/strict';
import test from 'node:test';
import { defineCli } from '../../dist/index.js';
import { createCliDiagnostic } from '../../dist/diagnostics.js';
import {
  applyCliPluginCommands,
  checkCliPluginCompatibility,
  createCliPluginHost,
  defineCliPluginManifest
} from '../../dist/plugins/index.js';

test('defineCliPluginManifest normalizes defaults and freezes hook metadata', () => {
  const manifest = defineCliPluginManifest({
    name: 'audit',
    version: '1.0.0',
    hooks: [
      { name: 'prepare', event: 'prerun', order: 5, before: ['audit:observe'], after: ['setup'] },
      { name: 'observe', event: 'postrun' }
    ]
  });

  assert.equal(manifest.schemaVersion, 'cli-core.plugin.v1');
  assert.deepEqual(manifest.runtimes, ['node', 'deno', 'bun']);
  assert.deepEqual(manifest.capabilities, []);
  assert.deepEqual(manifest.commands, []);
  assert.equal(manifest.hooks[0].order, 5);
  assert.deepEqual(manifest.hooks[0].before, ['audit:observe']);
  assert.deepEqual(manifest.hooks[0].after, ['setup']);
  assert.equal(manifest.hooks[1].order, 0);
  assert.deepEqual(manifest.hooks[1].before, []);
  assert.deepEqual(manifest.hooks[1].after, []);
  assert.throws(() => {
    manifest.hooks[0].before.push('later');
  }, TypeError);
});

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
  assert.equal(version.diagnostics[0].fields.pluginName, 'future');
  assert.equal(version.diagnostics[0].fields.pluginVersion, '1.0.0');
  assert.equal(version.diagnostics[0].fields.minVersion, '99.0.0');
  assert.equal(runtime.ok, false);
  assert.equal(runtime.diagnostics[0].code, 'CLI_PLUGIN_RUNTIME_UNSUPPORTED');
  assert.equal(runtime.diagnostics[0].fields.pluginName, 'node-only');
  assert.equal(runtime.diagnostics[0].fields.runtime, 'deno');
  assert.deepEqual(runtime.diagnostics[0].fields.supportedRuntimes, ['node']);
});

test('checkCliPluginCompatibility reports manifest, max-version, and capability diagnostics', () => {
  const invalid = checkCliPluginCompatibility({
    name: '  ',
    version: '  ',
    hooks: [
      { name: '  ', event: 'init' },
      { name: 'repeat', event: 'init' },
      { name: 'repeat', event: 'prerun' }
    ]
  });
  const maxVersion = checkCliPluginCompatibility({
    name: 'old-only',
    version: '1.0.0',
    cliCore: { maxVersion: '0.0.0' }
  });
  const capabilities = checkCliPluginCompatibility({
    name: 'wide',
    version: '1.0.0',
    capabilities: ['audit', 'network']
  }, { allowedCapabilities: ['audit'] });
  const defaultRuntime = checkCliPluginCompatibility({
    name: 'portable',
    version: '1.0.0'
  }, { runtime: 'bun' });

  assert.equal(invalid.ok, false);
  assert.deepEqual(invalid.diagnostics.map((diagnostic) => diagnostic.code), [
    'CLI_PLUGIN_INVALID_MANIFEST',
    'CLI_PLUGIN_INVALID_MANIFEST',
    'CLI_PLUGIN_INVALID_MANIFEST',
    'CLI_PLUGIN_INVALID_MANIFEST'
  ]);
  assert.equal(invalid.diagnostics[0].fields.pluginName, '  ');
  assert.equal(invalid.diagnostics[1].fields.pluginName, '  ');
  assert.equal(invalid.diagnostics[2].fields.event, 'init');
  assert.equal(invalid.diagnostics[3].fields.hookName, 'repeat');
  assert.equal(maxVersion.ok, false);
  assert.equal(maxVersion.diagnostics[0].fields.maxVersion, '0.0.0');
  assert.equal(capabilities.ok, false);
  assert.deepEqual(capabilities.diagnostics[0].fields.capabilities, ['network']);
  assert.equal(defaultRuntime.ok, true);

  const exactBounds = checkCliPluginCompatibility({
    name: 'exact',
    version: '1.0.0',
    cliCore: { minVersion: '1.2.3.9', maxVersion: '1.2.3.9' },
    capabilities: ['audit']
  }, { cliCoreVersion: '1.2.3' });
  assert.equal(exactBounds.ok, true);
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

test('createCliPluginHost reports duplicates, exposes compatibility, caches loads, and handles missing plugins', async () => {
  let loads = 0;
  const manifest = defineCliPluginManifest({
    name: 'audit',
    version: '1.0.0',
    hooks: [{ name: 'record', event: 'prerun' }]
  });
  const host = createCliPluginHost([
    {
      manifest,
      load: () => {
        loads += 1;
        return { manifest, hooks: { record: () => undefined } };
      }
    },
    {
      manifest: { name: 'audit', version: '2.0.0' },
      load: () => ({})
    }
  ]);

  assert.equal(host.manifests.length, 1);
  assert.equal(host.diagnostics.length, 1);
  assert.equal(host.diagnostics[0].code, 'CLI_PLUGIN_DUPLICATE_NAME');
  assert.equal(host.diagnostics[0].fields.pluginName, 'audit');
  assert.equal(host.checkPlugin('audit')?.ok, true);
  assert.equal(host.checkPlugin('missing'), undefined);

  const first = await host.loadPlugin('audit');
  const second = await host.loadPlugin('audit');
  const missing = await host.loadPlugin('missing');

  assert.strictEqual(first, second);
  assert.equal(loads, 1);
  assert.equal(first.ok, true);
  assert.deepEqual(first.diagnostics, []);
  assert.equal(missing.ok, false);
  assert.equal(missing.diagnostics[0].code, 'CLI_PLUGIN_INVALID_MANIFEST');
  assert.equal(missing.diagnostics[0].fields.pluginName, 'missing');
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

test('planHooks honors order, declaration order, and plugin-name references', () => {
  const host = createCliPluginHost([
    {
      manifest: {
        name: 'audit',
        version: '1.0.0',
        hooks: [
          { name: 'late', event: 'prerun', order: 20 },
          { name: 'early', event: 'prerun', order: -10 }
        ]
      },
      load: () => ({ hooks: {} })
    },
    {
      manifest: {
        name: 'ship',
        version: '1.0.0',
        hooks: [{ name: 'middle', event: 'prerun', after: ['audit'] }]
      },
      load: () => ({ hooks: {} })
    },
    {
      manifest: {
        name: 'cleanup',
        version: '1.0.0',
        hooks: [{ name: 'finish', event: 'finally', order: 0 }]
      },
      load: () => ({ hooks: {} })
    }
  ]);
  const plan = host.planHooks('prerun');

  assert.deepEqual(plan.hooks.map((hook) => hook.id), ['audit:early', 'audit:late', 'ship:middle']);
  assert.deepEqual(plan.hooks.map((hook) => hook.order), [-10, 20, 0]);
  assert.deepEqual(host.planHooks('finally').hooks.map((hook) => hook.id), ['cleanup:finish']);
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
  const loadFailure = await host.loadPlugin('loader-failure');

  assert.equal(result.ok, false);
  assert.equal(loadFailure.ok, false);
  assert.equal(loadFailure.diagnostics[0].fields.errorMessage, 'loader failed');
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    'CLI_PLUGIN_LOAD_FAILED',
    'CLI_PLUGIN_HOOK_FAILED'
  ]);
  assert.deepEqual(result.hooks.map((hook) => hook.status), ['failed', 'failed']);
  assert.deepEqual(result.hooks.map((hook) => hook.effects), [[], []]);
  assert.equal(result.diagnostics[0].fields.pluginName, 'loader-failure');
  assert.equal(result.diagnostics[0].fields.errorMessage, 'loader failed');
  assert.equal(result.diagnostics[1].fields.pluginName, 'hook-failure');
  assert.equal(result.diagnostics[1].fields.hookName, 'explode');
  assert.equal(result.diagnostics[1].fields.errorMessage, 'hook failed');
});

test('runHooks reports missing hooks and module manifest mismatches without running handlers', async () => {
  let mismatchedHandlerRan = false;
  const missingHookManifest = defineCliPluginManifest({
    name: 'missing-hook',
    version: '1.0.0',
    hooks: [{ name: 'declared', event: 'prerun' }]
  });
  const mismatchedManifest = defineCliPluginManifest({
    name: 'mismatch',
    version: '1.0.0',
    hooks: [{ name: 'declared', event: 'prerun' }]
  });
  const host = createCliPluginHost([
    {
      manifest: missingHookManifest,
      load: () => ({ manifest: missingHookManifest })
    },
    {
      manifest: mismatchedManifest,
      load: () => ({
        manifest: defineCliPluginManifest({ name: 'other', version: '2.0.0' }),
        hooks: {
          declared: () => {
            mismatchedHandlerRan = true;
          }
        }
      })
    }
  ]);
  const result = await host.runHooks('prerun');

  assert.equal(result.ok, false);
  assert.deepEqual(result.hooks.map((hook) => hook.status), ['failed', 'failed']);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    'CLI_PLUGIN_HOOK_MISSING',
    'CLI_PLUGIN_MODULE_MANIFEST_MISMATCH'
  ]);
  assert.equal(result.diagnostics[0].fields.hookName, 'declared');
  assert.equal(result.diagnostics[0].fields.event, 'prerun');
  assert.equal(result.diagnostics[1].fields.moduleName, 'other');
  assert.equal(result.diagnostics[1].fields.moduleVersion, '2.0.0');
  assert.equal(mismatchedHandlerRan, false);
});

test('runHooks reports one-sided module manifest mismatches', async () => {
  const sameNameManifest = defineCliPluginManifest({
    name: 'same-name',
    version: '1.0.0',
    hooks: [{ name: 'declared', event: 'prerun' }]
  });
  const sameVersionManifest = defineCliPluginManifest({
    name: 'same-version',
    version: '1.0.0',
    hooks: [{ name: 'declared', event: 'prerun' }]
  });
  const host = createCliPluginHost([
    {
      manifest: sameNameManifest,
      load: () => ({ manifest: defineCliPluginManifest({ name: 'same-name', version: '2.0.0' }) })
    },
    {
      manifest: sameVersionManifest,
      load: () => ({ manifest: defineCliPluginManifest({ name: 'other-name', version: '1.0.0' }) })
    }
  ]);
  const result = await host.runHooks('prerun');

  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    'CLI_PLUGIN_MODULE_MANIFEST_MISMATCH',
    'CLI_PLUGIN_MODULE_MANIFEST_MISMATCH'
  ]);
  assert.equal(result.diagnostics[0].fields.moduleVersion, '2.0.0');
  assert.equal(result.diagnostics[1].fields.moduleName, 'other-name');
});

test('runHooks passes immutable context and preserves hook diagnostics and effects', async () => {
  const diagnostic = createCliDiagnostic('CLI_PLUGIN_HOOK_FAILED', 'error', 'Denied by plugin.', {
    reason: 'policy'
  });
  const manifest = defineCliPluginManifest({
    name: 'audit',
    version: '1.0.0',
    hooks: [
      { name: 'record', event: 'prerun' },
      { name: 'noop', event: 'prerun' }
    ]
  });
  const payload = { nested: { token: 'secret' } };
  const host = createCliPluginHost([
    {
      manifest,
      load: () => ({
        manifest,
        hooks: {
          record: (context) => {
            assert.equal(context.event, 'prerun');
            assert.equal(context.pluginName, 'audit');
            assert.equal(context.hookName, 'record');
            assert.deepEqual(context.payload, payload);
            assert.throws(() => {
              context.payload.nested.token = 'changed';
            }, TypeError);
            return {
              effects: [{ kind: 'audit.record', payload: { event: context.event } }],
              diagnostics: [diagnostic]
            };
          },
          noop: () => undefined
        }
      })
    }
  ]);
  const result = await host.runHooks('prerun', { payload });

  assert.equal(result.ok, false);
  assert.deepEqual(result.hooks.map((hook) => hook.status), ['failed', 'passed']);
  assert.equal(result.hooks[0].effects[0].kind, 'audit.record');
  assert.deepEqual(result.hooks[0].diagnostics, [diagnostic]);
  assert.deepEqual(result.hooks[1].effects, []);
  assert.deepEqual(payload, { nested: { token: 'secret' } });
});

test('runHooks captures string and unknown thrown values as diagnostic fields', async () => {
  const loaderManifest = defineCliPluginManifest({
    name: 'string-loader',
    version: '1.0.0',
    hooks: [{ name: 'load', event: 'prerun' }]
  });
  const hookManifest = defineCliPluginManifest({
    name: 'unknown-hook',
    version: '1.0.0',
    hooks: [{ name: 'fail', event: 'prerun' }]
  });
  const host = createCliPluginHost([
    {
      manifest: loaderManifest,
      load: () => {
        throw 'loader string';
      }
    },
    {
      manifest: hookManifest,
      load: () => ({
        manifest: hookManifest,
        hooks: {
          fail: () => {
            throw { not: 'an error' };
          }
        }
      })
    }
  ]);
  const result = await host.runHooks('prerun');

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].fields.errorMessage, 'loader string');
  assert.equal(result.diagnostics[1].fields.errorMessage, 'Unknown plugin error.');
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

test('planHooks keeps incompatible plugin hooks out of runnable plans', async () => {
  let loads = 0;
  const host = createCliPluginHost([
    {
      manifest: {
        name: 'future',
        version: '1.0.0',
        cliCore: { minVersion: '99.0.0' },
        hooks: [{ name: 'future-hook', event: 'prerun' }]
      },
      load: () => {
        loads += 1;
        return {};
      }
    }
  ]);
  const plan = host.planHooks('prerun');
  const run = await host.runHooks('prerun');
  const directLoad = await host.loadPlugin('future');

  assert.equal(host.diagnostics[0].code, 'CLI_PLUGIN_CORE_VERSION_UNSUPPORTED');
  assert.deepEqual(plan.hooks, []);
  assert.equal(run.ok, true);
  assert.deepEqual(run.hooks, []);
  assert.equal(directLoad.ok, false);
  assert.equal(directLoad.diagnostics[0].code, 'CLI_PLUGIN_CORE_VERSION_UNSUPPORTED');
  assert.equal(loads, 0);
});

test('planHooks uses declaration order tie-breakers and before constraints that reverse base order', () => {
  const host = createCliPluginHost([
    {
      manifest: {
        name: 'z-plugin',
        version: '1.0.0',
        hooks: [
          { name: 'z-hook', event: 'prerun' },
          { name: 'a-hook', event: 'prerun' }
        ]
      },
      load: () => ({ hooks: {} })
    },
    {
      manifest: {
        name: 'a-plugin',
        version: '1.0.0',
        hooks: [
          { name: 'runs-before-z', event: 'prerun', before: ['z-plugin:z-hook'] },
          { name: 'self', event: 'prerun', before: ['a-plugin:self'] }
        ]
      },
      load: () => ({ hooks: {} })
    }
  ]);
  const plan = host.planHooks('prerun');

  assert.deepEqual(plan.hooks.map((hook) => hook.id), [
    'z-plugin:a-hook',
    'a-plugin:runs-before-z',
    'z-plugin:z-hook',
    'a-plugin:self'
  ]);
  assert.deepEqual(plan.diagnostics, []);

  const declarationHost = createCliPluginHost([
    {
      manifest: {
        name: 'order',
        version: '1.0.0',
        hooks: [
          { name: 'z-first', event: 'postrun' },
          { name: 'a-second', event: 'postrun' }
        ]
      },
      load: () => ({ hooks: {} })
    }
  ]);
  assert.deepEqual(declarationHost.planHooks('postrun').hooks.map((hook) => hook.id), [
    'order:z-first',
    'order:a-second'
  ]);
});

test('runHooks returns ordering diagnostics without loading cyclic plugins', async () => {
  let loads = 0;
  const host = createCliPluginHost([
    {
      manifest: { name: 'a', version: '1.0.0', hooks: [{ name: 'one', event: 'init', after: ['b:two'] }] },
      load: () => {
        loads += 1;
        return {};
      }
    },
    {
      manifest: { name: 'b', version: '1.0.0', hooks: [{ name: 'two', event: 'init', after: ['a:one'] }] },
      load: () => {
        loads += 1;
        return {};
      }
    }
  ]);

  const result = await host.runHooks('init');

  assert.equal(result.ok, false);
  assert.deepEqual(result.hooks, []);
  assert.equal(result.diagnostics[0].code, 'CLI_PLUGIN_HOOK_ORDER_CYCLE');
  assert.deepEqual(result.diagnostics[0].fields.hooks, ['a:one', 'b:two']);
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

test('applyCliPluginCommands accepts a compiled program and preserves existing command metadata', () => {
  const program = defineCli({
    name: 'ship',
    version: '2.0.0',
    description: 'Shipping tools.',
    config: {
      fields: [{ name: 'profile', type: 'string', default: 'dev' }]
    },
    options: [{ name: 'verbose', type: 'boolean', flags: ['--verbose'] }],
    commands: [
      {
        name: 'deploy',
        aliases: [{ name: 'd', deprecated: 'Use deploy.' }],
        description: 'Deploy a service.',
        deprecated: 'Use release.',
        allowPassThrough: true,
        positionals: [{ name: 'service' }],
        options: [{ name: 'dryRun', type: 'boolean', flags: ['--dry-run'] }],
        commands: [{ name: 'logs' }]
      }
    ]
  });
  const application = applyCliPluginCommands(program, [
    {
      name: 'ship-audit',
      version: '1.0.0',
      commands: [{ name: 'audit' }]
    }
  ]);

  assert.equal(application.schemaVersion, 'cli-core.plugin-command-application.v1');
  assert.equal(application.ok, true);
  assert.equal(application.definition.name, 'ship');
  assert.equal(application.definition.version, '2.0.0');
  assert.equal(application.definition.description, 'Shipping tools.');
  assert.deepEqual(application.definition.config, {
    fields: [{ name: 'profile', type: 'string', default: 'dev' }]
  });
  assert.deepEqual(application.definition.options?.map((option) => option.name), ['verbose']);
  assert.deepEqual(application.definition.commands?.map((command) => command.name), ['deploy', 'audit']);
  assert.equal(application.definition.commands?.[0].aliases?.[0].name, 'd');
  assert.equal(application.definition.commands?.[0].aliases?.[0].deprecated, 'Use deploy.');
  assert.equal(application.definition.commands?.[0].description, 'Deploy a service.');
  assert.equal(application.definition.commands?.[0].deprecated, 'Use release.');
  assert.equal(application.definition.commands?.[0].allowPassThrough, true);
  assert.deepEqual(application.definition.commands?.[0].positionals, [{ name: 'service', required: true, variadic: false }]);
  assert.deepEqual(application.definition.commands?.[0].options?.[0], {
    name: 'dryRun',
    type: 'boolean',
    flags: ['--dry-run'],
    required: false,
    hidden: false
  });
  assert.equal(application.definition.commands?.[0].commands?.[0].name, 'logs');
  assert.equal(application.program.commands.some((command) => command.path.join(' ') === 'audit'), true);
});

test('applyCliPluginCommands preserves raw definition options, config, aliases, and command defaults', () => {
  const application = applyCliPluginCommands({
    name: 'ship',
    version: '2.1.0',
    description: 'Ship tools.',
    config: {
      fields: [
        { name: 'profile', type: 'string', default: 'dev' }
      ]
    },
    options: [
      {
        name: 'tag',
        type: 'array',
        flags: ['--tag'],
        description: 'Release tag.',
        required: true,
        default: ['latest'],
        allowEmpty: true,
        hidden: true
      }
    ],
    commands: [
      {
        name: 'deploy',
        aliases: [{ name: 'd' }],
        options: [{ name: 'force', type: 'boolean', flags: ['--force'], default: false }]
      }
    ]
  }, [
    { name: 'empty', version: '1.0.0' }
  ]);

  assert.equal(application.ok, true);
  assert.equal(application.definition.version, '2.1.0');
  assert.equal(application.definition.description, 'Ship tools.');
  assert.deepEqual(application.definition.config, {
    fields: [
      { name: 'profile', type: 'string', default: 'dev' }
    ]
  });
  assert.deepEqual(application.definition.options?.[0], {
    name: 'tag',
    type: 'array',
    flags: ['--tag'],
    description: 'Release tag.',
    required: true,
    default: ['latest'],
    allowEmpty: true,
    hidden: true
  });
  assert.equal(application.definition.commands?.[0].source?.kind, 'definition');
  assert.deepEqual(application.definition.commands?.[0].aliases, [{ name: 'd' }]);
  assert.deepEqual(application.definition.commands?.[0].options?.[0], {
    name: 'force',
    type: 'boolean',
    flags: ['--force'],
    default: false
  });
  assert.deepEqual(application.contributions, []);
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
  const rejection = application.diagnostics.find((diagnostic) => diagnostic.code === 'CLI_PLUGIN_COMMAND_REJECTED');
  assert.equal(rejection?.fields.pluginName, 'future-audit');
  assert.equal(rejection?.fields.pluginVersion, '1.0.0');

  const noCommandApplication = applyCliPluginCommands({
    name: 'ship'
  }, [
    {
      name: 'future-no-commands',
      version: '1.0.0',
      cliCore: { minVersion: '99.0.0' }
    }
  ]);
  assert.equal(noCommandApplication.ok, false);
  assert.equal(noCommandApplication.diagnostics.some((diagnostic) => diagnostic.code === 'CLI_PLUGIN_COMMAND_REJECTED'), false);
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
  assert.deepEqual(application.diagnostics.map((diagnostic) => diagnostic.fields.conflictKind), [
    'command_path',
    'alias_path'
  ]);
  assert.deepEqual(application.diagnostics.map((diagnostic) => diagnostic.fields.path), [
    ['status'],
    ['st']
  ]);
});

test('applyCliPluginCommands rejects conflicts inside one plugin and omits empty contributions', () => {
  const application = applyCliPluginCommands({
    name: 'ship'
  }, [
    { name: 'empty', version: '1.0.0' },
    {
      name: 'conflicting',
      version: '1.0.0',
      commands: [
        { name: 'audit', aliases: ['a'] },
        { name: 'scan', aliases: ['audit'] },
        { name: 'tools', aliases: ['tools'] },
        { name: 'audit' }
      ]
    }
  ]);

  assert.equal(application.ok, false);
  assert.deepEqual(application.contributions.map((contribution) => contribution.pluginName), ['conflicting']);
  assert.deepEqual(application.contributions[0].commandPaths, [['audit']]);
  assert.deepEqual(application.contributions[0].aliasPaths, [['a']]);
  assert.equal(application.program.commands.some((command) => command.path.join(' ') === 'scan'), false);
  assert.deepEqual(application.diagnostics.map((diagnostic) => diagnostic.fields.conflictKind), [
    'alias_path',
    'alias_path',
    'command_path'
  ]);
});

test('applyCliPluginCommands keeps adjacent path tokens distinct for nested command conflicts', () => {
  const application = applyCliPluginCommands({
    name: 'ship',
    commands: [
      { name: 'ab', commands: [{ name: 'c' }] }
    ]
  }, [
    {
      name: 'plugin',
      version: '1.0.0',
      commands: [
        { name: 'a', commands: [{ name: 'bc' }] },
        { name: 'tools', commands: [{ name: 'scan', aliases: [{ name: 'ab' }] }] }
      ]
    }
  ]);

  assert.equal(application.ok, true);
  assert.deepEqual(application.contributions[0].commandPaths, [
    ['a'],
    ['a', 'bc'],
    ['tools'],
    ['tools', 'scan']
  ]);
  assert.deepEqual(application.contributions[0].aliasPaths, [['tools', 'ab']]);
  assert.equal(application.program.commands.some((command) => command.path.join(' ') === 'a bc'), true);
});
