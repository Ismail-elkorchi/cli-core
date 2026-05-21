import assert from 'node:assert/strict';
import test from 'node:test';
import { defineCli, parseCli, runCli } from '../../dist/index.js';
import {
  createCliFailureEnvelope,
  createCliSchemaEnvelope,
  describeCliSchemas,
  redactCliSecrets
} from '../../dist/schema/index.js';

test('consumer can wrap run results and redact secrets through the schema subpath', async () => {
  const program = defineCli({
    name: 'ship',
    commands: [{ name: 'deploy', positionals: [{ name: 'service' }] }]
  });
  const invocation = parseCli(program, { argv: ['deploy', 'api'] });
  const result = await runCli(program, {
    mode: 'plan',
    invocation,
    effects: [{ kind: 'spawn', command: 'ship', argv: ['deploy', 'api'], env: { SHIP_TOKEN: 'abc123' } }]
  });
  const envelope = createCliSchemaEnvelope({
    payloadSchemaVersion: result.schemaVersion,
    data: result
  });
  const failure = createCliFailureEnvelope({
    kind: 'policy_denial',
    diagnostics: [
      {
        code: 'CLI_RUN_HANDLER_FAILED',
        severity: 'error',
        message: 'blocked password=secret',
        fields: { password: 'secret' }
      }
    ],
    data: { authorization: 'Bearer abc123' }
  });

  assert.equal(describeCliSchemas().some((schema) => schema.version === 'cli-core.run-result.v1'), true);
  assert.equal(envelope.schemaVersion, 'cli-core.schema-envelope.v1');
  assert.equal(envelope.data.effects[0].env.SHIP_TOKEN, '[REDACTED]');
  assert.equal(failure.redacted, true);
  assert.equal(failure.diagnostics[0].fields.password, '[REDACTED]');
  assert.equal(redactCliSecrets({ token: 'abc123' }).token, '[REDACTED]');
});
