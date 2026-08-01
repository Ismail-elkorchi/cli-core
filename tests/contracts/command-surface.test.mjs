import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('root and command subpath expose the intended command model APIs', async () => {
  const root = await import('../../dist/index.js');
  const command = await import('../../dist/command/public.js');

  assert.equal(typeof root.defineCli, 'function');
  assert.equal(typeof root.createCliInvocationParser, 'function');
  assert.equal(typeof root.validateCli, 'function');
  assert.equal(typeof root.findCliCommand, 'undefined');
  assert.equal(typeof root.findCliCommandByAlias, 'undefined');
  assert.equal(typeof command.defineCli, 'function');
  assert.equal(typeof command.findCliCommand, 'function');
  assert.equal(typeof command.findCliCommandByAlias, 'function');
  assert.equal(typeof command.findCliCommandChildren, 'undefined');
});

test('root declarations include command and parse result contracts', async () => {
  const text = await readFile(new URL('../../dist/index.d.ts', import.meta.url), 'utf8');

  assert.match(text, /CliDefinition/);
  assert.match(text, /CliProgram/);
  assert.match(text, /ParsedInvocation/);
  assert.match(text, /CliOptionBinder/);
  assert.doesNotMatch(text, /findCliCommand/);
  assert.doesNotMatch(text, /internal\//);
});
