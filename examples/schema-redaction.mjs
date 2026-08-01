import { defineCli, runCli } from '../dist/index.js';
import {
  createCliFailureEnvelope,
  createCliSchemaEnvelope,
  describeCliSchemas,
  redactCliSecretsWithReport
} from '../dist/schema/index.js';
import { createExampleInvocationParser } from './invocation.mjs';

export async function runSchemaRedactionExample() {
  const program = defineCli({
    name: 'ship',
    commands: [{ name: 'deploy' }]
  });
  const invocation = createExampleInvocationParser().parse(program, { argv: ['deploy'] });
  const run = await runCli(program, {
    mode: 'plan',
    invocation,
    effects: [{ kind: 'spawn', command: 'ship', argv: ['deploy'], env: { SHIP_TOKEN: 'abc123' } }]
  });
  const envelope = createCliSchemaEnvelope({
    payloadSchemaVersion: run.schemaVersion,
    payload: run
  });
  const failure = createCliFailureEnvelope({
    kind: 'policy_denial',
    diagnostics: [
      {
        code: 'CLI_RUN_HANDLER_FAILED',
        severity: 'error',
        message: 'blocked token=abc123',
        fields: { token: 'abc123' }
      }
    ]
  });
  const report = redactCliSecretsWithReport({ password: 'secret', safe: 'visible' });

  return {
    schemas: describeCliSchemas(),
    run,
    envelope,
    failure,
    report
  };
}
