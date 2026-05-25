import assert from 'node:assert/strict';
import test from 'node:test';
import { createCliDiagnostic } from '../../dist/diagnostics.js';
import { defineCli, runCli } from '../../dist/index.js';
import { createCliPluginHost } from '../../dist/plugins/index.js';

const program = defineCli({
  name: 'ship',
  commands: [
    {
      name: 'deploy',
      positionals: [{ name: 'service' }]
    }
  ]
});

test('runCli returns a plan-mode envelope without invoking handlers', async () => {
  let called = false;
  const result = await runCli(program, {
    mode: 'plan',
    argv: ['deploy', 'api'],
    handlers: {
      deploy: () => {
        called = true;
        return {};
      }
    },
    effects: [{ kind: 'spawn', command: 'ship', argv: ['deploy', 'api'] }]
  });

  assert.equal(called, false);
  assert.equal(result.schemaVersion, 'cli-core.run-result.v1');
  assert.equal(result.mode, 'plan');
  assert.equal(result.exitKind, 'ok');
  assert.equal(result.exitStatus, 0);
  assert.deepEqual(result.events.map((event) => event.name), ['run.started', 'run.planned', 'run.completed']);
  assert.equal(result.effects[0].kind, 'spawn');
});

test('runCli defaults to plan mode with empty argv and preserves request artifacts', async () => {
  const result = await runCli(program, {
    artifacts: [{ id: 'request-summary', kind: 'json', payload: { service: 'api' } }]
  });

  assert.equal(result.mode, 'plan');
  assert.deepEqual(result.invocation.argv, []);
  assert.deepEqual(result.invocation.commandPath, []);
  assert.equal(result.exitKind, 'ok');
  assert.equal(result.artifacts[0].id, 'request-summary');
  assert.deepEqual(result.events.find((event) => event.name === 'run.planned')?.payload, {
    effects: 0,
    artifacts: 1
  });
  assert.deepEqual(result.events[0].payload, {
    mode: 'plan',
    commandPath: [],
    argv: []
  });
  assert.deepEqual(result.events.at(-1)?.payload, {
    exitKind: 'ok',
    exitStatus: 0
  });
});

test('runCli apply mode invokes a handler and returns artifacts and effects', async () => {
  const result = await runCli(program, {
    mode: 'apply',
    runId: 'run-apply',
    argv: ['deploy', 'api'],
    handlers: {
      deploy: (context) => ({
        effects: [{ kind: 'custom', name: 'deploy.service', payload: { service: context.invocation.positionals.service } }],
        artifacts: [{ id: 'deploy-summary', kind: 'json', payload: { service: 'api' } }]
      })
    }
  });

  assert.equal(result.runId, 'run-apply');
  assert.equal(result.ok, true);
  assert.deepEqual(result.events.map((event) => event.name), ['run.started', 'run.planned', 'run.applied', 'run.completed']);
  assert.deepEqual(result.events.find((event) => event.name === 'run.applied')?.payload, {
    effects: 1,
    artifacts: 1
  });
  assert.equal(result.effects[0].name, 'deploy.service');
  assert.equal(result.artifacts[0].id, 'deploy-summary');
});

test('runCli applies exit status policy and handler diagnostics', async () => {
  const result = await runCli(program, {
    mode: 'apply',
    argv: ['deploy', 'api'],
    exitStatusPolicy: { policy_denied: 77 },
    handlers: {
      deploy: () => ({
        exitKind: 'policy_denied',
        diagnostics: [
          {
            code: 'CLI_RUN_HANDLER_FAILED',
            severity: 'error',
            message: 'Policy denied by test handler.',
            fields: { commandPath: ['deploy'] }
          }
        ]
      })
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.exitKind, 'policy_denied');
  assert.equal(result.exitStatus, 77);
  assert.equal(result.events.some((event) => event.name === 'run.applied'), true);
});

test('runCli reports missing handlers and thrown handler failures', async () => {
  const missing = await runCli(program, { mode: 'apply', argv: ['deploy', 'api'] });
  const thrown = await runCli(program, {
    mode: 'apply',
    argv: ['deploy', 'api'],
    handlers: {
      deploy: () => {
        throw new Error('failed');
      }
    }
  });

  assert.equal(missing.exitKind, 'policy_denied');
  assert.equal(missing.diagnostics[0].code, 'CLI_RUN_HANDLER_MISSING');
  assert.equal(missing.diagnostics[0].severity, 'error');
  assert.deepEqual(missing.diagnostics[0].fields.commandPath, ['deploy']);
  assert.deepEqual(missing.events.find((event) => event.name === 'run.skipped')?.payload, { reason: 'missing_handler' });
  assert.equal(thrown.exitKind, 'external_error');
  assert.equal(thrown.diagnostics[0].code, 'CLI_RUN_HANDLER_FAILED');
  assert.equal(thrown.diagnostics[0].severity, 'error');
  assert.deepEqual(thrown.diagnostics[0].fields.commandPath, ['deploy']);
  assert.equal(thrown.diagnostics[0].fields.errorMessage, 'failed');
  assert.deepEqual(thrown.events.find((event) => event.name === 'run.skipped')?.payload, { reason: 'handler_failed' });
});

test('runCli reports string and unknown thrown handler failures', async () => {
  const stringFailure = await runCli(program, {
    mode: 'apply',
    argv: ['deploy', 'api'],
    handlers: {
      deploy: () => {
        throw 'string failed';
      }
    }
  });
  const unknownFailure = await runCli(program, {
    mode: 'apply',
    argv: ['deploy', 'api'],
    handlers: {
      deploy: () => {
        throw { reason: 'opaque' };
      }
    }
  });

  assert.equal(stringFailure.diagnostics[0].fields.errorMessage, 'string failed');
  assert.equal(unknownFailure.diagnostics[0].fields.errorMessage, 'Unknown run handler error.');
});

test('runCli maps cancelled, interrupted, and timed out requests to exit kinds', async () => {
  const cancelled = await runCli(program, { argv: ['deploy', 'api'], cancelled: true });
  const interrupted = await runCli(program, { argv: ['deploy', 'api'], interrupted: true });
  const timeout = await runCli(program, { argv: ['deploy', 'api'], timeoutMs: 10, elapsedMs: 11 });
  const equalTimeout = await runCli(program, { argv: ['deploy', 'api'], timeoutMs: 10, elapsedMs: 10 });
  const noElapsed = await runCli(program, { argv: ['deploy', 'api'], timeoutMs: 10 });
  const noTimeout = await runCli(program, { argv: ['deploy', 'api'], elapsedMs: 11 });
  const cancelledFirst = await runCli(program, {
    argv: ['deploy', 'api'],
    cancelled: true,
    interrupted: true,
    timeoutMs: 1,
    elapsedMs: 2
  });

  assert.equal(cancelled.exitKind, 'cancelled');
  assert.equal(interrupted.exitKind, 'interrupted');
  assert.equal(timeout.exitKind, 'timeout');
  assert.equal(cancelled.diagnostics[0].code, 'CLI_RUN_CANCELLED');
  assert.deepEqual(cancelled.diagnostics[0].fields.commandPath, ['deploy']);
  assert.equal(interrupted.diagnostics[0].code, 'CLI_RUN_INTERRUPTED');
  assert.deepEqual(interrupted.diagnostics[0].fields.commandPath, ['deploy']);
  assert.equal(timeout.diagnostics[0].code, 'CLI_RUN_TIMEOUT');
  assert.deepEqual(timeout.diagnostics[0].fields, {
    commandPath: ['deploy'],
    timeoutMs: 10,
    elapsedMs: 11
  });
  assert.equal(equalTimeout.exitKind, 'ok');
  assert.equal(noElapsed.exitKind, 'ok');
  assert.equal(noTimeout.exitKind, 'ok');
  assert.equal(cancelledFirst.exitKind, 'cancelled');
  assert.deepEqual(timeout.events.map((event) => event.name), ['run.started', 'run.skipped', 'run.completed']);
  assert.deepEqual(timeout.events.find((event) => event.name === 'run.skipped')?.payload, { reason: 'timeout' });
});

test('runCli derives stable run identifiers from program, mode, argv, and command path', async () => {
  const first = await runCli(program, { mode: 'plan', argv: ['deploy', 'api'] });
  const second = await runCli(program, { mode: 'plan', argv: ['deploy', 'api'] });
  const apply = await runCli(program, { mode: 'apply', argv: ['deploy', 'api'] });
  const otherArgv = await runCli(program, { mode: 'plan', argv: ['deploy', 'web'] });
  const root = await runCli(program, { mode: 'plan', argv: [] });

  assert.equal(first.runId, second.runId);
  assert.notEqual(first.runId, apply.runId);
  assert.notEqual(first.runId, otherArgv.runId);
  assert.notEqual(first.runId, root.runId);
  assert.match(first.runId, /^run_[a-z0-9]+$/);
});

test('runCli finds handlers by command id, command path, and command name in order', async () => {
  const nestedProgram = defineCli({
    name: 'ship',
    commands: [{ name: 'deploy', commands: [{ name: 'status' }] }]
  });
  const command = nestedProgram.commands.find((candidate) => candidate.path.join(' ') === 'deploy status');
  assert.notEqual(command, undefined);
  const byId = await runCli(nestedProgram, {
    mode: 'apply',
    argv: ['deploy', 'status'],
    handlers: {
      [command.id]: () => ({ artifacts: [{ id: 'by-id', kind: 'text', payload: 'id' }] }),
      'deploy status': () => ({ artifacts: [{ id: 'by-path', kind: 'text', payload: 'path' }] }),
      status: () => ({ artifacts: [{ id: 'by-name', kind: 'text', payload: 'name' }] })
    }
  });
  const byPath = await runCli(nestedProgram, {
    mode: 'apply',
    argv: ['deploy', 'status'],
    handlers: {
      'deploy status': () => ({ artifacts: [{ id: 'by-path', kind: 'text', payload: 'path' }] }),
      status: () => ({ artifacts: [{ id: 'by-name', kind: 'text', payload: 'name' }] })
    }
  });
  const byName = await runCli(nestedProgram, {
    mode: 'apply',
    argv: ['deploy', 'status'],
    handlers: {
      status: () => ({ artifacts: [{ id: 'by-name', kind: 'text', payload: 'name' }] })
    }
  });

  assert.equal(byId.artifacts[0].id, 'by-id');
  assert.equal(byPath.artifacts[0].id, 'by-path');
  assert.equal(byName.artifacts[0].id, 'by-name');
});

test('runCli passes immutable handler context data', async () => {
  const requestContext = { nested: { token: 'secret' } };
  const result = await runCli(program, {
    mode: 'apply',
    argv: ['deploy', 'api'],
    context: requestContext,
    handlers: {
      deploy: (context) => {
        assert.equal(context.mode, 'apply');
        assert.deepEqual(context.command.path, ['deploy']);
        assert.deepEqual(context.context, requestContext);
        assert.throws(() => {
          context.context.nested.token = 'changed';
        }, TypeError);
        return {
          artifacts: [{ id: 'context', kind: 'json', payload: context.context }]
        };
      }
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(requestContext, { nested: { token: 'secret' } });
  assert.equal(result.artifacts[0].payload.nested.token, '[REDACTED]');
});

test('runCli includes plugin prerun and postrun hook effects in the result envelope', async () => {
  const host = createCliPluginHost([
    {
      manifest: {
        name: 'audit',
        version: '1.0.0',
        hooks: [
          { name: 'before', event: 'prerun', order: 1 },
          { name: 'after', event: 'postrun', order: 2 }
        ]
      },
      load: () => ({
        hooks: {
          before: () => ({ effects: [{ kind: 'audit.before', payload: { token: 'secret-token' } }] }),
          after: () => ({ effects: [{ kind: 'audit.after', payload: { ok: true } }] })
        }
      })
    }
  ]);
  const result = await runCli(program, {
    mode: 'apply',
    argv: ['deploy', 'api'],
    pluginHost: host,
    handlers: { deploy: () => ({}) }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.effects.map((effect) => effect.kind), ['plugin', 'plugin']);
  assert.deepEqual(result.effects.map((effect) => effect.event), ['prerun', 'postrun']);
  assert.equal(result.effects[0].payload.token, '[REDACTED]');
  assert.equal(result.events.some((event) => event.name === 'plugin.hooks.planned'), true);
  assert.equal(result.events.some((event) => event.name === 'plugin.hooks.completed'), true);
  const completedStatuses = result.events
    .filter((event) => event.name === 'plugin.hooks.completed')
    .map((event) => event.payload.status);
  assert.equal(completedStatuses.length, 5);
  assert.equal(completedStatuses.every((status) => status === 'passed'), true);
});

test('runCli treats preparse as a parsed-invocation observation hook', async () => {
  const observedPayloads = [];
  const host = createCliPluginHost([
    {
      manifest: {
        name: 'observer',
        version: '1.0.0',
        hooks: [
          { name: 'init', event: 'init' },
          { name: 'preparse', event: 'preparse' },
          { name: 'finally', event: 'finally' }
        ]
      },
      load: () => ({
        hooks: {
          init: (context) => {
            observedPayloads.push({ hook: context.hookName, payload: context.payload });
          },
          preparse: (context) => {
            observedPayloads.push({ hook: context.hookName, payload: context.payload });
            return { effects: [{ kind: 'preparse.seen', payload: { commandPath: context.payload.commandPath } }] };
          },
          finally: (context) => {
            observedPayloads.push({ hook: context.hookName, payload: context.payload });
          }
        }
      })
    }
  ]);
  const result = await runCli(program, {
    mode: 'plan',
    argv: ['deploy', 'api'],
    pluginHost: host,
    pluginContext: { requestId: 'req-1' }
  });

  assert.deepEqual(observedPayloads.map((entry) => entry.hook), ['init', 'preparse', 'finally']);
  assert.deepEqual(observedPayloads[1].payload, {
    run: { requestId: 'req-1' },
    commandPath: ['deploy'],
    argv: ['deploy', 'api'],
    ok: true
  });
  assert.equal(result.effects.find((effect) => effect.event === 'preparse')?.effectKind, 'preparse.seen');
  assert.deepEqual(result.events.slice(0, 4).map((event) => event.name), [
    'plugin.hooks.planned',
    'plugin.hooks.completed',
    'plugin.hooks.planned',
    'plugin.hooks.completed'
  ]);
});

test('runCli preserves plugin hook diagnostics without converting them to handler failures', async () => {
  const host = createCliPluginHost([
    {
      manifest: { name: 'faulty', version: '1.0.0', hooks: [{ name: 'explode', event: 'prerun' }] },
      load: () => ({
        hooks: {
          explode: () => {
            throw new Error('plugin failed');
          }
        }
      })
    }
  ]);
  const result = await runCli(program, {
    mode: 'plan',
    argv: ['deploy', 'api'],
    pluginHost: host
  });

  assert.equal(result.ok, false);
  assert.equal(result.exitKind, 'policy_denied');
  assert.equal(result.diagnostics[0].code, 'CLI_PLUGIN_HOOK_FAILED');
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === 'CLI_RUN_HANDLER_FAILED'), false);
  const failedHookEvent = result.events.find((event) =>
    event.name === 'plugin.hooks.completed' && event.payload.hooks.length > 0
  );
  assert.equal(failedHookEvent?.payload.status, 'failed');
  assert.deepEqual(failedHookEvent?.payload.hooks, [
    {
      pluginName: 'faulty',
      hookName: 'explode',
      status: 'failed',
      effects: 0,
      diagnostics: 1
    }
  ]);
});

test('runCli records plugin planning diagnostics without running failed hook plans', async () => {
  let runHooksCalled = false;
  const diagnostic = createCliDiagnostic('CLI_PLUGIN_HOOK_ORDER_CYCLE', 'error', 'cycle', {
    hooks: ['a:one', 'b:two']
  });
  const pluginHost = {
    manifests: [],
    diagnostics: [],
    checkPlugin: () => undefined,
    planHooks: (event) => ({
      event,
      hooks: [{ id: 'a:one', pluginName: 'a', hookName: 'one', event, order: 0 }],
      diagnostics: [diagnostic]
    }),
    loadPlugin: async () => ({ ok: false, manifest: undefined, module: undefined, diagnostics: [] }),
    runHooks: async () => {
      runHooksCalled = true;
      return { event: 'prerun', ok: true, hooks: [], diagnostics: [] };
    }
  };
  const result = await runCli(program, {
    mode: 'plan',
    argv: ['deploy', 'api'],
    pluginHost
  });

  assert.equal(runHooksCalled, false);
  assert.equal(result.ok, false);
  assert.equal(result.exitKind, 'policy_denied');
  assert.equal(result.diagnostics[0].code, 'CLI_PLUGIN_HOOK_ORDER_CYCLE');
  assert.deepEqual(result.events[0].payload, {
    event: 'init',
    hooks: [
      {
        id: 'a:one',
        pluginName: 'a',
        hookName: 'one',
        order: 0
      }
    ]
  });
  assert.deepEqual(result.events[1].payload, {
    event: 'init',
    status: 'failed',
    hooks: []
  });
});

test('runCli runs finally hooks after handler failure', async () => {
  const host = createCliPluginHost([
    {
      manifest: { name: 'cleanup', version: '1.0.0', hooks: [{ name: 'always', event: 'finally' }] },
      load: () => ({
        hooks: {
          always: () => ({ effects: [{ kind: 'cleanup.seen', payload: { ok: true } }] })
        }
      })
    }
  ]);
  const result = await runCli(program, {
    mode: 'apply',
    argv: ['deploy', 'api'],
    pluginHost: host,
    handlers: {
      deploy: () => {
        throw new Error('handler failed');
      }
    }
  });

  assert.equal(result.exitKind, 'external_error');
  assert.equal(result.diagnostics[0].code, 'CLI_RUN_HANDLER_FAILED');
  assert.equal(result.effects[0].kind, 'plugin');
  assert.equal(result.effects[0].event, 'finally');
});

test('runCli runs finally hooks after skipped execution paths', async () => {
  const seen = [];
  const host = createCliPluginHost([
    {
      manifest: { name: 'cleanup', version: '1.0.0', hooks: [{ name: 'always', event: 'finally' }] },
      load: () => ({
        hooks: {
          always: () => {
            seen.push('finally');
            return { effects: [{ kind: 'cleanup.seen' }] };
          }
        }
      })
    }
  ]);

  const cancelled = await runCli(program, {
    argv: ['deploy', 'api'],
    cancelled: true,
    pluginHost: host
  });
  const missingHandler = await runCli(program, {
    mode: 'apply',
    argv: ['deploy', 'api'],
    pluginHost: host
  });

  assert.equal(cancelled.exitKind, 'cancelled');
  assert.equal(missingHandler.exitKind, 'policy_denied');
  assert.deepEqual(seen, ['finally', 'finally']);
  assert.equal(cancelled.effects[0].event, 'finally');
  assert.equal(missingHandler.effects[0].event, 'finally');
});

test('runCli skips postrun hooks when handler output is not successful but still runs finally', async () => {
  const seen = [];
  const host = createCliPluginHost([
    {
      manifest: {
        name: 'audit',
        version: '1.0.0',
        hooks: [
          { name: 'post', event: 'postrun' },
          { name: 'always', event: 'finally' }
        ]
      },
      load: () => ({
        hooks: {
          post: () => {
            seen.push('post');
          },
          always: () => {
            seen.push('finally');
          }
        }
      })
    }
  ]);
  const result = await runCli(program, {
    mode: 'apply',
    argv: ['deploy', 'api'],
    pluginHost: host,
    handlers: {
      deploy: () => ({ exitKind: 'external_error' })
    }
  });

  assert.equal(result.exitKind, 'external_error');
  assert.equal(result.ok, false);
  assert.deepEqual(seen, ['finally']);
});

test('runCli runs command_not_found hooks without hiding the parse failure', async () => {
  const host = createCliPluginHost([
    {
      manifest: {
        name: 'not-found',
        version: '1.0.0',
        hooks: [
          { name: 'suggest', event: 'command_not_found' },
          { name: 'always', event: 'finally' }
        ]
      },
      load: () => ({
        hooks: {
          suggest: () => ({ effects: [{ kind: 'suggest.command', payload: { replacement: 'deploy' } }] }),
          always: () => ({ effects: [{ kind: 'cleanup.done' }] })
        }
      })
    }
  ]);
  const result = await runCli(program, {
    mode: 'plan',
    argv: ['deply', 'api'],
    pluginHost: host
  });

  assert.equal(result.ok, false);
  assert.equal(result.exitKind, 'usage');
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === 'CLI_UNKNOWN_COMMAND'), true);
  assert.equal(result.effects[0].event, 'command_not_found');
  assert.equal(Object.hasOwn(result.effects[1], 'payload'), false);
  assert.equal(result.effects[1].event, 'finally');
  assert.deepEqual(result.events.find((event) => event.name === 'run.skipped')?.payload, { reason: 'usage' });
});

test('runCli validates structured spawn effects before planning or applying', async () => {
  const invalidCommand = await runCli(program, {
    mode: 'plan',
    argv: ['deploy', 'api'],
    effects: [{ kind: 'spawn', command: '  ', argv: ['deploy'] }]
  });
  const invalidArgv = await runCli(program, {
    mode: 'apply',
    argv: ['deploy', 'api'],
    effects: [{ kind: 'spawn', command: 'ship', argv: '--bad' }],
    handlers: {
      deploy: () => ({})
    }
  });

  assert.equal(invalidCommand.ok, false);
  assert.equal(invalidCommand.exitKind, 'policy_denied');
  assert.equal(invalidCommand.diagnostics[0].code, 'CLI_RUN_INVALID_EFFECT');
  assert.equal(invalidCommand.diagnostics[0].severity, 'error');
  assert.deepEqual(invalidCommand.diagnostics[0].fields, { effect: 'spawn' });
  assert.equal(invalidArgv.exitKind, 'external_error');
  assert.equal(invalidArgv.diagnostics[0].code, 'CLI_RUN_INVALID_EFFECT');
  assert.deepEqual(invalidArgv.diagnostics[0].fields, { effect: 'spawn', command: 'ship' });
});
