import assert from 'node:assert/strict';
import {
  createCompletionPayload,
  defineCli,
  describeCli,
  findCliCommand,
  parseCli,
  suggestRepairs
} from '../../dist/index.js';
import { createLargeCommandDefinition, createLargeCommandFixture } from '../../dist/testing/index.js';

export function runLargeCommandSurfaceCase(commandCount) {
  const metrics = [];
  const fixture = measure(metrics, 'generate-large-command-fixture', () =>
    createLargeCommandFixture({ commandCount, programName: 'scale' })
  );
  const program = measure(metrics, 'compile-large-command-fixture', () => defineCli(fixture.data));
  const targetIndex = commandCount - 1;
  const targetName = `command-${targetIndex}`;
  const targetFlag = `--detail-${targetIndex}`;

  assert.equal(fixture.id, `commands.large-program.${commandCount}`);
  assert.equal(fixture.data.commands.length, commandCount);
  assert.equal(createLargeCommandDefinition({ commandCount, programName: 'scale' }).commands.length, commandCount);
  assert.equal(program.diagnostics.length, 0);
  assert.equal(program.commands.length, commandCount + 1);
  assert.equal(program.pathIndex.length, commandCount + 1);
  assert.equal(program.aliasIndex.length, commandCount);

  const indexed = measure(metrics, 'lookup-final-command-through-index', () => findCliCommand(program, [targetName]));
  const invocation = measure(metrics, 'parse-final-command', () =>
    parseCli(program, { argv: [targetName, targetFlag, 'target'] })
  );
  const completion = measure(metrics, 'complete-root-prefix', () =>
    createCompletionPayload(program, { word: targetName.slice(0, -1) })
  );
  const unknown = measure(metrics, 'parse-near-miss-command', () =>
    parseCli(program, { argv: [`${targetName}x`] })
  );
  const repairs = measure(metrics, 'repair-near-miss-command', () => suggestRepairs(unknown, program));
  const manifest = measure(metrics, 'manifest-large-command-surface', () => describeCli(program));

  assert.equal(indexed?.id, targetName);
  assert.equal(invocation.ok, true);
  assert.equal(invocation.commandPath.join(' '), targetName);
  assert.equal(invocation.options.values[`detail${targetIndex}`], true);
  assert.equal(completion.items.some((item) => item.value === targetName), true);
  assert.equal(repairs[0].replacement.join(' '), targetName);
  assert.equal(manifest.commands.length, commandCount + 1);

  assertMetricsWithinBudget(metrics, commandCount);
}

function measure(metrics, name, operation) {
  const started = performance.now();
  const value = operation();
  metrics.push(Object.freeze({ name, durationMs: performance.now() - started }));
  return value;
}

function assertMetricsWithinBudget(metrics, commandCount) {
  const perOperationBudgetMs = Math.max(2_500, commandCount * 6);
  const totalBudgetMs = Math.max(8_000, commandCount * 20);
  for (const metric of metrics) {
    assert.equal(Number.isFinite(metric.durationMs), true, `${metric.name} duration must be finite`);
    assert.ok(
      metric.durationMs < perOperationBudgetMs,
      `${metric.name} exceeded scale budget: ${metric.durationMs}ms`
    );
  }
  const total = metrics.reduce((sum, metric) => sum + metric.durationMs, 0);
  assert.ok(total < totalBudgetMs, `scale scenario exceeded total budget: ${total}ms`);
}
