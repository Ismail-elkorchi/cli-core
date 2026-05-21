import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runTestingHarnessExample } from '../../examples/testing-harness.mjs';

test('README documents current foundation without feature-complete claims', async () => {
  const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');

  assert.match(readme, /package-foundation stage/);
  assert.match(readme, /createCliHarness/);
  assert.doesNotMatch(readme, /feature-complete/i);
});

test('testing harness example executes against the built package', async () => {
  const result = await runTestingHarnessExample();

  assert.equal(result.status, 'passed');
});
