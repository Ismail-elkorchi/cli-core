import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('schema declarations expose envelopes, failure policy, and redaction contracts', async () => {
  const text = await readFile(new URL('../../dist/schema/index.d.ts', import.meta.url), 'utf8');
  const root = await readFile(new URL('../../dist/index.d.ts', import.meta.url), 'utf8');

  assert.match(text, /CliSchemaEnvelope/);
  assert.match(text, /CliFailureEnvelope/);
  assert.match(text, /CliRedactionOptions/);
  assert.match(text, /repair-suggestions/);
  assert.match(text, /plugin-command-application/);
  assert.match(text, /run-effect/);
  assert.match(text, /diagnostic/);
  assert.match(text, /describeCliSchemas/);
  assert.match(text, /redactCliSecrets/);
  assert.match(root, /createCliSchemaEnvelope/);
  assert.match(root, /redactCliDiagnostics/);
});
