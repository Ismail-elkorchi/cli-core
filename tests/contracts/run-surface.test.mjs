import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('root entrypoint exposes runCli', async () => {
  const root = await import('../../dist/index.js');

  assert.equal(typeof root.runCli, 'function');
});

test('root declarations include run result, events, effects, artifacts, and exit policy contracts', async () => {
  const text = await readFile(new URL('../../dist/index.d.ts', import.meta.url), 'utf8');
  const runText = await readFile(new URL('../../dist/run/index.d.ts', import.meta.url), 'utf8');

  assert.match(text, /RunResult/);
  assert.match(text, /RunPayload/);
  assert.match(text, /RunEvent/);
  assert.match(text, /RunEffect/);
  assert.match(text, /PluginRunEffect/);
  assert.match(runText, /pluginHost/);
  assert.match(runText, /plugin\.hooks\.planned/);
  assert.match(text, /RunArtifact/);
  assert.match(text, /ExitKind/);
  assert.match(runText, /readonly payload/);
  assert.doesNotMatch(text, /internal\//);
});
