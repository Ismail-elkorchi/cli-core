import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCliMain,
  createNodeCliAdapter,
  renderRunResultText,
  runCliMain
} from '../../dist/adapter/index.js';
import { defineCli } from '../../dist/index.js';
import { createMemoryEffectHost } from '../../dist/effects/index.js';
import { createCliPluginHost } from '../../dist/plugins/index.js';

const program = defineCli({
  name: 'ship',
  commands: [{ name: 'deploy', positionals: [{ name: 'service' }] }]
});

test('runCliMain returns data without writing when no adapter host is supplied', async () => {
  let called = false;
  const result = await runCliMain({
    program,
    mode: 'plan',
    argv: ['deploy', 'api'],
    handlers: {
      deploy: () => {
        called = true;
        return {};
      }
    }
  });

  assert.equal(called, false);
  assert.equal(result.run.mode, 'plan');
  assert.equal(result.exitStatus, 0);
  assert.equal('effectReport' in result, false);
  assert.match(result.rendered.stdout, /plan /);
  assert.doesNotMatch(result.rendered.stdout, /effectApplication/);
});

test('runCliMain defaults to apply mode and lets request argv override host argv', async () => {
  const seen = [];
  const result = await runCliMain({
    program,
    argv: ['deploy', 'api'],
    handlers: {
      deploy: (context) => {
        seen.push({
          mode: context.mode,
          argv: context.invocation.argv,
          service: context.invocation.positionals.service
        });
        return {};
      }
    }
  }, {
    argv: ['deploy', 'wrong']
  });

  assert.equal(result.run.mode, 'apply');
  assert.equal(result.run.ok, true);
  assert.deepEqual(seen, [{ mode: 'apply', argv: ['deploy', 'api'], service: 'api' }]);
});

test('runCliMain writes only through the supplied host and maps exit status explicitly', async () => {
  const writes = { stdout: '', stderr: '', exitCode: -1 };
  const main = createCliMain({
    program,
    mode: 'apply',
    handlers: {
      deploy: () => ({
        artifacts: [{ id: 'summary', kind: 'json', payload: { service: 'api' } }]
      })
    }
  });

  const result = await main({
    argv: ['deploy', 'api'],
    writeStdout: (text) => {
      writes.stdout += text;
    },
    writeStderr: (text) => {
      writes.stderr += text;
    },
    setExitCode: (status) => {
      writes.exitCode = status;
    }
  });

  assert.equal(result.run.ok, true);
  assert.equal(writes.exitCode, 0);
  assert.match(writes.stdout, /apply /);
  assert.equal(writes.stderr, '');
});

test('runCliMain does not call output writers for empty rendered text', async () => {
  const writes = { stdout: 0, stderr: 0, exitCode: -1 };
  const result = await runCliMain({
    program,
    mode: 'plan',
    argv: ['deploy', 'api'],
    render: () => ({ stdout: '', stderr: '', exitStatus: 7 })
  }, {
    writeStdout: () => {
      writes.stdout += 1;
    },
    writeStderr: () => {
      writes.stderr += 1;
    },
    setExitCode: (status) => {
      writes.exitCode = status;
    }
  });

  assert.deepEqual(writes, { stdout: 0, stderr: 0, exitCode: 7 });
  assert.equal(result.exitStatus, 7);
});

test('runCliMain reports parse failures through stderr and explicit exit code', async () => {
  const writes = { stdout: '', stderr: '', exitCode: -1 };
  const result = await runCliMain({ program, argv: ['deply'] }, {
    writeStdout: (text) => {
      writes.stdout += text;
    },
    writeStderr: (text) => {
      writes.stderr += text;
    },
    setExitCode: (status) => {
      writes.exitCode = status;
    }
  });

  assert.equal(result.run.exitKind, 'parse_error');
  assert.equal(writes.exitCode, 2);
  assert.equal(writes.stdout, '');
  assert.match(writes.stderr, /CLI_UNKNOWN_COMMAND/);
});

test('runCliMain can plan or apply run effects through explicit effect policy', async () => {
  const memory = createMemoryEffectHost();
  const planned = await runCliMain({
    program,
    mode: 'plan',
    argv: ['deploy', 'api'],
    effects: [{ kind: 'write_file', path: 'deploy.json', content: '{"ok":true}' }],
    effectMode: 'plan'
  });
  const applied = await runCliMain({
    program,
    mode: 'plan',
    argv: ['deploy', 'api'],
    effects: [{ kind: 'write_file', path: 'deploy.json', content: '{"ok":true}' }],
    effectMode: 'apply',
    effectHost: memory.host,
    effectPolicy: { allowWriteFile: true }
  });

  assert.equal('effectReport' in planned, true);
  assert.equal(planned.rendered.stdout.includes('effectApplication ok'), true);
  assert.equal(planned.effectReport?.reports[0].status, 'planned');
  assert.equal(planned.effectReport?.mode, 'plan');
  assert.equal(applied.effectReport?.reports[0].status, 'applied');
  assert.equal(applied.effectReport?.mode, 'apply');
  assert.equal(memory.files()['deploy.json'], '{"ok":true}');
});

test('runCliMain forwards optional run fields that change public behavior', async () => {
  const observedPayloads = [];
  const pluginHost = createCliPluginHost([
    {
      manifest: {
        name: 'observer',
        version: '1.0.0',
        hooks: [{ name: 'init', event: 'init' }]
      },
      load: () => ({
        hooks: {
          init: (context) => {
            observedPayloads.push(context.payload);
          }
        }
      })
    }
  ]);
  const result = await runCliMain({
    program,
    mode: 'apply',
    argv: ['deploy', 'api'],
    context: { requestId: 'req-secret' },
    pluginHost,
    pluginContext: { traceId: 'trace-1' },
    effects: [{ kind: 'custom', name: 'preplanned', payload: { value: 1 } }],
    artifacts: [{ id: 'before', kind: 'json', payload: { value: 2 } }],
    redaction: { sensitiveKeys: ['requestId'] },
    handlers: {
      deploy: (context) => ({
        artifacts: [{ id: 'context', kind: 'json', payload: context.context }]
      })
    }
  });

  assert.equal(result.run.ok, true);
  assert.deepEqual(observedPayloads[0].run, { traceId: 'trace-1' });
  assert.equal(result.run.effects[0].name, 'preplanned');
  assert.deepEqual(result.run.artifacts.map((artifact) => artifact.id), ['before', 'context']);
  assert.equal(result.run.artifacts[1].payload.requestId, '[REDACTED]');
});

test('runCliMain forwards exit status policy into parse failure rendering', async () => {
  const result = await runCliMain({
    program,
    argv: ['unknown'],
    exitStatusPolicy: { parse_error: 9 }
  });

  assert.equal(result.run.exitKind, 'parse_error');
  assert.equal(result.exitStatus, 9);
  assert.match(result.rendered.stderr, /exit parse_error 9/);
});

test('adapter rendering remains redacted by default', async () => {
  const result = await runCliMain({
    program,
    mode: 'apply',
    argv: ['deploy', 'api'],
    handlers: {
      deploy: () => ({
        effects: [{ kind: 'spawn', command: 'ship', argv: ['deploy'], env: { SHIP_TOKEN: 'secret-token' } }]
      })
    }
  });

  assert.equal(result.run.effects[0].env.SHIP_TOKEN, '[REDACTED]');
  assert.doesNotMatch(JSON.stringify(result), /secret-token/);
});

test('runCliMain passes redaction options into effect application reports', async () => {
  const memory = createMemoryEffectHost();
  const result = await runCliMain({
    program,
    mode: 'plan',
    argv: ['deploy', 'api'],
    effects: [{ kind: 'write_file', path: 'token-file.txt', content: 'token=abc123' }],
    artifacts: [{ id: 'secret-artifact', kind: 'json', payload: { token: 'artifact-token' } }],
    effectMode: 'apply',
    effectHost: memory.host,
    effectPolicy: { allowWriteFile: true },
    redaction: { replacement: '[MASKED]' }
  });

  assert.equal(result.effectReport?.ok, true);
  assert.equal(result.run.events.at(-1)?.name, 'run.completed');
  assert.equal(result.run.effects[0].content, '[MASKED]');
  assert.equal(result.run.artifacts[0].payload.token, '[MASKED]');
  assert.equal(result.effectReport?.reports[0].effect.content, '[MASKED]');
  assert.equal(memory.files()['token-file.txt'], 'token=abc123');
});

test('createNodeCliAdapter adapts process-like argv and streams without reading globals', async () => {
  const processLike = {
    argv: ['node', 'ship.mjs', 'deploy', 'api'],
    stdout: { chunks: [], write(chunk) { this.chunks.push(chunk); } },
    stderr: { chunks: [], write(chunk) { this.chunks.push(chunk); } },
    exitCode: -1
  };
  const adapter = createNodeCliAdapter(processLike);
  const result = await runCliMain({
    program,
    mode: 'plan',
    handlers: { deploy: () => ({}) }
  }, adapter);

  assert.equal(result.run.invocation.argv.join(' '), 'deploy api');
  assert.equal(processLike.exitCode, 0);
  assert.equal(processLike.stdout.chunks.length, 1);
  assert.equal(processLike.stderr.chunks.length, 0);

  processLike.argv.push('changed');
  const nextResult = await runCliMain({
    program,
    mode: 'plan',
    handlers: { deploy: () => ({}) }
  }, adapter);

  assert.equal(nextResult.run.invocation.argv.join(' '), 'deploy api');
});

test('renderRunResultText uses a nonzero status when effect application fails', async () => {
  const result = await runCliMain({
    program,
    mode: 'plan',
    argv: ['deploy', 'api'],
    effects: [{ kind: 'write_file', path: 'deploy.json', content: '{"ok":true}' }],
    effectMode: 'apply'
  });
  const rendered = renderRunResultText(result.run, result.effectReport);

  assert.equal(rendered.exitStatus, 3);
  assert.match(rendered.stderr, /effectApplication failed/);
  assert.match(rendered.stderr, /CLI_EFFECT_HOST_MISSING/);
});

test('renderRunResultText preserves a nonzero run status when effect application also fails', async () => {
  const result = await runCliMain({
    program,
    mode: 'apply',
    argv: ['deploy', 'api'],
    handlers: {
      deploy: () => ({
        exitKind: 'external_error',
        exitStatus: 7,
        effects: [{ kind: 'write_file', path: 'deploy.json', content: '{"ok":false}' }]
      })
    },
    effectMode: 'apply'
  });

  assert.equal(result.effectReport?.ok, false);
  assert.equal(result.rendered.exitStatus, 7);
  assert.match(result.rendered.stderr, /^exit external_error 7$/m);
  assert.match(result.rendered.stderr, /^effectApplication failed$/m);
});

test('renderRunResultText writes a stderr summary for non-ok runs without diagnostics', async () => {
  const result = await runCliMain({
    program,
    mode: 'apply',
    argv: ['deploy', 'api'],
    handlers: {
      deploy: () => ({ exitKind: 'external_error', exitStatus: 5 })
    }
  });

  assert.equal(result.run.diagnostics.length, 0);
  assert.equal(result.rendered.stdout, '');
  assert.match(result.rendered.stderr, /^apply run_/);
  assert.match(result.rendered.stderr, /^command deploy$/m);
  assert.match(result.rendered.stderr, /^exit external_error 5$/m);
  assert.match(result.rendered.stderr, /^effects 0$/m);
  assert.match(result.rendered.stderr, /^artifacts 0$/m);
});

test('renderRunResultText describes root and nested command summaries line by line', async () => {
  const rootProgram = defineCli({ name: 'ship' });
  const nestedProgram = defineCli({
    name: 'ship',
    commands: [{
      name: 'admin',
      commands: [{ name: 'deploy' }]
    }]
  });
  const root = await runCliMain({ program: rootProgram, mode: 'plan' });
  const nested = await runCliMain({ program, mode: 'plan', argv: ['deploy', 'api'] });
  const deep = await runCliMain({ program: nestedProgram, mode: 'plan', argv: ['admin', 'deploy'] });

  assert.match(root.rendered.stdout, /^plan run_/);
  assert.match(root.rendered.stdout, /^command \(root\)$/m);
  assert.match(root.rendered.stdout, /^exit ok 0$/m);
  assert.match(root.rendered.stdout, /^effects 0$/m);
  assert.match(root.rendered.stdout, /^artifacts 0$/m);
  assert.match(nested.rendered.stdout, /^command deploy$/m);
  assert.doesNotMatch(nested.rendered.stdout, /commanddeploy/);
  assert.match(deep.rendered.stdout, /^command admin deploy$/m);
  assert.doesNotMatch(deep.rendered.stdout, /command admindeploy/);
});
