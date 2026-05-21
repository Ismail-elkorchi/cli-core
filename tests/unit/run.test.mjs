import assert from 'node:assert/strict';
import test from 'node:test';
import { createCliPluginHost, defineCli, runCli } from '../../dist/index.js';

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

test('runCli apply mode invokes a handler and returns artifacts and effects', async () => {
  const result = await runCli(program, {
    mode: 'apply',
    runId: 'run-apply',
    argv: ['deploy', 'api'],
    handlers: {
      deploy: (context) => ({
        effects: [{ kind: 'custom', name: 'deploy.service', data: { service: context.invocation.positionals.service } }],
        artifacts: [{ id: 'deploy-summary', kind: 'json', data: { service: 'api' } }]
      })
    }
  });

  assert.equal(result.runId, 'run-apply');
  assert.equal(result.ok, true);
  assert.deepEqual(result.events.map((event) => event.name), ['run.started', 'run.planned', 'run.applied', 'run.completed']);
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
  assert.equal(thrown.exitKind, 'external_error');
  assert.equal(thrown.diagnostics[0].code, 'CLI_RUN_HANDLER_FAILED');
});

test('runCli maps cancelled, interrupted, and timed out requests to exit kinds', async () => {
  const cancelled = await runCli(program, { argv: ['deploy', 'api'], cancelled: true });
  const interrupted = await runCli(program, { argv: ['deploy', 'api'], interrupted: true });
  const timeout = await runCli(program, { argv: ['deploy', 'api'], timeoutMs: 10, elapsedMs: 11 });

  assert.equal(cancelled.exitKind, 'cancelled');
  assert.equal(interrupted.exitKind, 'interrupted');
  assert.equal(timeout.exitKind, 'timeout');
  assert.deepEqual(timeout.events.map((event) => event.name), ['run.started', 'run.skipped', 'run.completed']);
});

test('runCli derives stable run identifiers from program, mode, argv, and command path', async () => {
  const first = await runCli(program, { mode: 'plan', argv: ['deploy', 'api'] });
  const second = await runCli(program, { mode: 'plan', argv: ['deploy', 'api'] });

  assert.equal(first.runId, second.runId);
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
          before: () => ({ effects: [{ kind: 'audit.before', data: { token: 'secret-token' } }] }),
          after: () => ({ effects: [{ kind: 'audit.after', data: { ok: true } }] })
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
  assert.equal(result.effects[0].data.token, '[REDACTED]');
  assert.equal(result.events.some((event) => event.name === 'plugin.hooks.planned'), true);
  assert.equal(result.events.some((event) => event.name === 'plugin.hooks.completed'), true);
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
});

test('runCli runs finally hooks after handler failure', async () => {
  const host = createCliPluginHost([
    {
      manifest: { name: 'cleanup', version: '1.0.0', hooks: [{ name: 'always', event: 'finally' }] },
      load: () => ({
        hooks: {
          always: () => ({ effects: [{ kind: 'cleanup.seen', data: { ok: true } }] })
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

test('runCli runs command_not_found hooks without hiding the parse failure', async () => {
  const host = createCliPluginHost([
    {
      manifest: { name: 'not-found', version: '1.0.0', hooks: [{ name: 'suggest', event: 'command_not_found' }] },
      load: () => ({
        hooks: {
          suggest: () => ({ effects: [{ kind: 'suggest.command', data: { replacement: 'deploy' } }] })
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
});
