import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('completion and repair subpaths expose machine-readable APIs', async () => {
  const completion = await import('../../dist/completion/index.js');
  const repair = await import('../../dist/repair/index.js');
  const root = await import('../../dist/index.js');

  assert.equal(typeof completion.createCompletionPayload, 'function');
  assert.equal(typeof completion.createCompletionRequest, 'function');
  assert.equal(typeof completion.completeCli, 'function');
  assert.equal(typeof completion.createCompletionCommand, 'function');
  assert.equal(typeof completion.createCompletionScript, 'function');
  assert.equal(typeof completion.createCompletionInstallPlan, 'function');
  assert.equal(typeof root.completeCli, 'function');
  assert.equal(typeof repair.suggestRepairs, 'function');
  assert.equal(typeof repair.createRepairSuggestionResult, 'function');
  assert.equal(typeof root.createCompletionPayload, 'function');
});

test('root declarations include only core completion contracts', async () => {
  const text = await readFile(new URL('../../dist/index.d.ts', import.meta.url), 'utf8');

  assert.match(text, /CompletionPayload/);
  assert.match(text, /CompletionResponse/);
  assert.doesNotMatch(text, /CompletionCommand/);
  assert.doesNotMatch(text, /CompletionInstallPlan/);
  assert.doesNotMatch(text, /RepairSuggestion/);
  assert.doesNotMatch(text, /internal\//);
});
