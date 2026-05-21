import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
            'audit-prerun': () => ({ effects: [{ kind: 'audit.record', data: { ok: true } }] })
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
