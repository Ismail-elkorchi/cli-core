import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('root entrypoint exposes command model APIs', async () => {
  const module = await import('../../dist/index.js');

  assert.equal(typeof module.defineCli, 'function');
  assert.equal(typeof module.parseCli, 'function');
  assert.equal(typeof module.validateCli, 'function');
  assert.equal(typeof module.findCliCommand, 'function');
});

test('root declarations include command and parse result contracts', async () => {
  const text = await readFile(new URL('../../dist/index.d.ts', import.meta.url), 'utf8');

  assert.match(text, /CliDefinition/);
  assert.match(text, /CliProgram/);
  assert.match(text, /ParsedInvocation/);
  assert.doesNotMatch(text, /internal\//);
});
