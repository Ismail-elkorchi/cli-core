import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCliFailureEnvelope,
  createCliSchemaEnvelope,
  createUnsupportedSchemaDiagnostic,
  defineCli,
  describeCliSchemas,
  exitKindToFailureKind,
  failureKindForDiagnostics,
  isCliSchemaVersion,
  redactCliSecretsWithReport,
  runCli
} from '../../dist/index.js';

test('schema registry exposes stable public schema versions', () => {
  const schemas = describeCliSchemas();

  assert.equal(isCliSchemaVersion('cli-core.run-result.v1'), true);
  assert.equal(isCliSchemaVersion('cli-core.config-discovery.v1'), true);
  assert.equal(isCliSchemaVersion('cli-core.completion-response.v1'), true);
  assert.equal(isCliSchemaVersion('cli-core.effect-application.v1'), true);
  assert.equal(isCliSchemaVersion('cli-core.unknown.v1'), false);
  assert.equal(schemas.some((schema) => schema.version === 'cli-core.failure.v1'), true);
  assert.equal(schemas.some((schema) => schema.version === 'cli-core.completion-request.v1'), true);
  assert.equal(schemas.every((schema) => schema.stability === 'public'), true);
});

test('schema envelopes wrap payloads with package and schema metadata', () => {
  const envelope = createCliSchemaEnvelope({
    payloadSchemaVersion: 'cli-core.run-result.v1',
    data: { token: 'secret-value', visible: true }
  });

  assert.equal(envelope.schemaVersion, 'cli-core.schema-envelope.v1');
  assert.equal(envelope.packageName, '@ismail-elkorchi/cli-core');
  assert.equal(envelope.payloadSchemaVersion, 'cli-core.run-result.v1');
  assert.equal(envelope.data.token, '[REDACTED]');
  assert.equal(envelope.data.visible, true);
});

test('redaction reports sensitive keys, string patterns, and opt-out behavior', () => {
  const report = redactCliSecretsWithReport({
    nested: {
      apiKey: 'abc123',
      note: 'token=secret-token'
    }
  });
  const disabled = redactCliSecretsWithReport({ password: 'secret' }, { enabled: false });

  assert.equal(report.redacted, true);
  assert.equal(report.value.nested.apiKey, '[REDACTED]');
  assert.equal(report.value.nested.note, '[REDACTED]');
  assert.equal(report.matches.length, 2);
  assert.equal(disabled.value.password, 'secret');
  assert.equal(disabled.redacted, false);
});

test('failure envelopes redact diagnostics and classify unsupported schemas as diagnostics', () => {
  const unsupported = createUnsupportedSchemaDiagnostic('cli-core.old.v1');
  const failure = createCliFailureEnvelope({
    kind: 'internal_error',
    diagnostics: [
      unsupported,
      {
        code: 'CLI_RUN_HANDLER_FAILED',
        severity: 'error',
        message: 'handler failed token=abc123',
        fields: { accessToken: 'abc123' }
      }
    ],
    data: { password: 'secret' }
  });

  assert.equal(unsupported.code, 'CLI_SCHEMA_UNSUPPORTED');
  assert.equal(failure.schemaVersion, 'cli-core.failure.v1');
  assert.equal(failure.redacted, true);
  assert.equal(failure.diagnostics[1].message, 'handler failed [REDACTED]');
  assert.equal(failure.diagnostics[1].fields.accessToken, '[REDACTED]');
  assert.equal(failure.data.password, '[REDACTED]');
});

test('failure helpers map exit kinds and diagnostics to typed failure kinds', () => {
  assert.equal(exitKindToFailureKind('policy_denied'), 'policy_denial');
  assert.equal(exitKindToFailureKind('timeout'), 'timeout');
  assert.equal(failureKindForDiagnostics([
    {
      code: 'CLI_PLUGIN_LOAD_FAILED',
      severity: 'error',
      message: 'plugin failed',
      fields: { plugin: 'audit' }
    }
  ]), 'plugin_error');
  assert.equal(failureKindForDiagnostics([
    {
      code: 'CLI_UNKNOWN_COMMAND',
      severity: 'error',
      message: 'unknown command',
      fields: { commandPath: ['deply'] }
    }
  ]), 'parse');
});

test('runCli redacts run effects, artifacts, events, and diagnostics by default', async () => {
  const program = defineCli({
    name: 'ship',
    commands: [{ name: 'deploy' }]
  });
  const result = await runCli(program, {
    mode: 'apply',
    argv: ['deploy'],
    effects: [{ kind: 'spawn', command: 'ship', argv: ['deploy'], env: { SHIP_TOKEN: 'abc123' } }],
    handlers: {
      deploy: () => ({
        artifacts: [{ id: 'summary', kind: 'json', data: { password: 'secret' } }],
        diagnostics: [
          {
            code: 'CLI_RUN_HANDLER_FAILED',
            severity: 'warning',
            message: 'token=abc123',
            fields: { token: 'abc123' }
          }
        ]
      })
    }
  });
  const unredacted = await runCli(program, {
    mode: 'plan',
    argv: ['deploy'],
    redaction: { enabled: false },
    effects: [{ kind: 'spawn', command: 'ship', argv: ['deploy'], env: { SHIP_TOKEN: 'abc123' } }]
  });

  assert.equal(result.effects[0].env.SHIP_TOKEN, '[REDACTED]');
  assert.equal(result.artifacts[0].data.password, '[REDACTED]');
  assert.equal(result.diagnostics[0].message, '[REDACTED]');
  assert.equal(result.diagnostics[0].fields.token, '[REDACTED]');
  assert.equal(unredacted.effects[0].env.SHIP_TOKEN, 'abc123');
});
