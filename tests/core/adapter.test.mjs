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
  assert.match(result.rendered.stdout, /plan /);
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

test('runCliMain reports usage failures through stderr and explicit exit code', async () => {
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

  assert.equal(result.run.exitKind, 'usage');
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

  assert.equal(planned.effectReport?.reports[0].status, 'planned');
  assert.equal(applied.effectReport?.reports[0].status, 'applied');
  assert.equal(memory.files()['deploy.json'], '{"ok":true}');
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
  assert.match(rendered.stderr, /CLI_EFFECT_HOST_MISSING/);
});
