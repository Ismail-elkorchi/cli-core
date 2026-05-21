import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCompletionPayload,
  defineCli,
  describeCli,
  parseCli,
  redactCliSecrets,
  runCli,
  suggestRepairs
} from '../../dist/index.js';
import { createLargeCommandDefinition } from '../../dist/testing/index.js';

test('scale-sensitive command, completion, repair, run, and redaction paths stay within a conservative budget', async () => {
  const metrics = [];
  const program = measure(metrics, 'compile-large-program', () => defineCli(largeDefinition(128)));
  const invocation = measure(metrics, 'parse-nested-command', () => parseCli(program, {
    argv: ['command-127', 'inspect', '--detail-127']
  }));
  const completion = measure(metrics, 'complete-root-prefix', () => createCompletionPayload(program, { word: 'command-12' }));
  const unknown = measure(metrics, 'parse-unknown-command', () => parseCli(program, { argv: ['command-12x'] }));
  const repairs = measure(metrics, 'repair-unknown-command', () => suggestRepairs(unknown, program));
  const manifest = measure(metrics, 'manifest-large-program', () => describeCli(program));
  const redacted = measure(metrics, 'redact-large-payload', () => redactCliSecrets(secretPayload(128)));
  const run = await measureAsync(metrics, 'plan-large-effect-set', () => runCli(program, {
    mode: 'plan',
    invocation,
    effects: Array.from({ length: 128 }, (_unused, index) => ({
      kind: 'spawn',
      command: 'runtime',
      argv: ['check', String(index)],
      env: { RUNTIME_TOKEN: `token-${index}` }
    }))
  }));

  assert.equal(program.diagnostics.length, 0);
  assert.equal(program.commands.length, 257);
  assert.equal(invocation.ok, true);
  assert.ok(completion.items.length >= 9);
  assert.equal(completion.items.some((item) => item.value === 'command-127'), true);
  assert.equal(repairs[0].code, 'REPAIR_UNKNOWN_COMMAND');
  assert.equal(manifest.commands.length, 257);
  assert.equal(redacted.items[0].token, '[REDACTED]');
  assert.equal(run.effects[0].env.RUNTIME_TOKEN, '[REDACTED]');

  for (const metric of metrics) {
    assert.equal(Number.isFinite(metric.durationMs), true, `${metric.name} duration must be finite`);
    assert.ok(metric.durationMs < 2_500, `${metric.name} exceeded conservative benchmark budget: ${metric.durationMs}ms`);
  }
  const total = metrics.reduce((sum, metric) => sum + metric.durationMs, 0);
  assert.ok(total < 8_000, `scale-sensitive benchmark total exceeded budget: ${total}ms`);
});

function measure(metrics, name, operation) {
  const started = performance.now();
  const value = operation();
  metrics.push(Object.freeze({ name, durationMs: performance.now() - started }));
  return value;
}

async function measureAsync(metrics, name, operation) {
  const started = performance.now();
  const value = await operation();
  metrics.push(Object.freeze({ name, durationMs: performance.now() - started }));
  return value;
}

function largeDefinition(count) {
  const definition = createLargeCommandDefinition({ commandCount: count, programName: 'runtime' });
  return {
    ...definition,
    commands: definition.commands.map((command, index) => ({
      ...command,
      options: [{ name: `option${index}`, type: 'boolean', flags: [`--option-${index}`] }],
      commands: [
        {
          name: 'inspect',
          aliases: [`i${index}`],
          options: [{ name: `detail${index}`, type: 'boolean', flags: [`--detail-${index}`] }]
        }
      ]
    }))
  };
}

function secretPayload(count) {
  return {
    items: Array.from({ length: count }, (_unused, index) => ({
      id: `item-${index}`,
      token: `secret-${index}`,
      nested: { apiKey: `api-${index}` }
    }))
  };
}
