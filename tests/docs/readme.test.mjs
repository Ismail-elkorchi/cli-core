import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('README documents current foundation without feature-complete claims', async () => {
  const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');

  assert.match(readme, /package-foundation stage/);
  assert.doesNotMatch(readme, /feature-complete/i);
});
