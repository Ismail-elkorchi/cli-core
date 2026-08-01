import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defineCli,
  runCli
} from '../support/invocation-parser.mjs';
import {
  createCliFailureEnvelope,
  createCliSchemaEnvelope,
  createUnsupportedSchemaDiagnostic,
  describeCliSchemas,
  exitKindToFailureKind,
  failureKindForDiagnostics,
  isCliSchemaVersion,
  redactCliSecretsWithReport
} from '../../dist/schema/index.js';

test('schema registry exposes stable public schema versions', () => {
  const schemas = describeCliSchemas();
  const expected = [
    ['program', 'cli-core.program.v1'],
    ['invocation', 'cli-core.invocation.v2'],
    ['semantic-validation', 'cli-core.semantic-validation.v1'],
    ['help', 'cli-core.help.v1'],
    ['version', 'cli-core.version.v1'],
    ['manifest', 'cli-core.manifest.v1'],
    ['config-resolution', 'cli-core.config-resolution.v1'],
    ['config-discovery', 'cli-core.config-discovery.v1'],
    ['completion', 'cli-core.completion.v1'],
    ['completion-protocol', 'cli-core.completion-protocol.v1'],
    ['completion-request', 'cli-core.completion-request.v1'],
    ['completion-response', 'cli-core.completion-response.v1'],
    ['completion-command', 'cli-core.completion-command.v1'],
    ['completion-script', 'cli-core.completion-script.v1'],
    ['completion-install-plan', 'cli-core.completion-install-plan.v1'],
    ['repair-suggestions', 'cli-core.repair-suggestions.v1'],
    ['plugin', 'cli-core.plugin.v1'],
    ['plugin-command-application', 'cli-core.plugin-command-application.v1'],
    ['run-result', 'cli-core.run-result.v1'],
    ['run-event', 'cli-core.run-event.v1'],
    ['run-effect', 'cli-core.run-effect.v1'],
    ['artifact', 'cli-core.artifact.v1'],
    ['diagnostic', 'cli-core.diagnostic.v1'],
    ['effect-application', 'cli-core.effect-application.v1'],
    ['schema-envelope', 'cli-core.schema-envelope.v1'],
    ['failure', 'cli-core.failure.v1'],
    ['redaction', 'cli-core.redaction.v1']
  ];

  assert.equal(isCliSchemaVersion('cli-core.run-result.v1'), true);
  assert.equal(isCliSchemaVersion('cli-core.config-discovery.v1'), true);
  assert.equal(isCliSchemaVersion('cli-core.completion-response.v1'), true);
  assert.equal(isCliSchemaVersion('cli-core.completion-protocol.v1'), true);
  assert.equal(isCliSchemaVersion('cli-core.effect-application.v1'), true);
  assert.equal(isCliSchemaVersion('cli-core.diagnostic.v1'), true);
  assert.equal(isCliSchemaVersion('cli-core.unknown.v1'), false);
  assert.equal(schemas.some((schema) => schema.version === 'cli-core.failure.v1'), true);
  assert.equal(schemas.some((schema) => schema.version === 'cli-core.completion-request.v1'), true);
  assert.equal(schemas.some((schema) => schema.version === 'cli-core.plugin-command-application.v1'), true);
  assert.equal(schemas.every((schema) => schema.stability === 'public'), true);
  assert.deepEqual(schemas.map((schema) => [schema.name, schema.version]), expected);
  assert.equal(schemas.every((schema) => schema.purpose.length > 0), true);
});

test('schema envelopes wrap payloads with package and schema metadata', () => {
  const envelope = createCliSchemaEnvelope({
    payloadSchemaVersion: 'cli-core.run-result.v1',
    payload: { token: 'secret-value', visible: true }
  });

  assert.equal(envelope.schemaVersion, 'cli-core.schema-envelope.v1');
  assert.equal(envelope.packageName, '@ismail-elkorchi/cli-core');
  assert.equal(envelope.payloadSchemaVersion, 'cli-core.run-result.v1');
  assert.equal(envelope.payload.token, '[REDACTED]');
  assert.equal(envelope.payload.visible, true);
});

test('redaction reports sensitive keys, string patterns, and opt-out behavior', () => {
  const report = redactCliSecretsWithReport({
    nested: {
      apiKey: 'abc123',
      'api-key': 'plain-secret',
      note: 'token=secret-token',
      apiHeader: 'api-key=abc123',
      compactApiHeader: 'apikey=abc123',
      authHeader: 'Bearer abc.def/123=='
    }
  });
  const basic = redactCliSecretsWithReport('Basic abc.def/123==');
  const spacedBearer = redactCliSecretsWithReport('Bearer    abc.def/123==');
  const safe = redactCliSecretsWithReport({ visible: 'hello' });
  const disabled = redactCliSecretsWithReport({ password: 'secret' }, { enabled: false });

  assert.equal(report.redacted, true);
  assert.equal(report.value.nested.apiKey, '[REDACTED]');
  assert.equal(report.value.nested['api-key'], '[REDACTED]');
  assert.equal(report.value.nested.note, '[REDACTED]');
  assert.equal(report.value.nested.apiHeader, '[REDACTED]');
  assert.equal(report.value.nested.compactApiHeader, '[REDACTED]');
  assert.equal(report.value.nested.authHeader, '[REDACTED]');
  assert.deepEqual(report.matches.map((match) => match.path), [
    '$.nested.apiKey',
    '$.nested.api-key',
    '$.nested.note',
    '$.nested.apiHeader',
    '$.nested.compactApiHeader',
    '$.nested.authHeader'
  ]);
  assert.deepEqual(report.matches.map((match) => match.reason), [
    'sensitive_key',
    'sensitive_key',
    'string_pattern',
    'string_pattern',
    'string_pattern',
    'string_pattern'
  ]);
  assert.equal(report.matches[0].key, 'apiKey');
  assert.equal(report.matches[1].key, 'api-key');
  assert.match(report.matches[3].pattern, /api/);
  assert.equal(basic.value, '[REDACTED]');
  assert.equal(spacedBearer.value, '[REDACTED]');
  assert.equal(safe.redacted, false);
  assert.deepEqual(safe.matches, []);
  assert.equal(disabled.value.password, 'secret');
  assert.equal(disabled.redacted, false);
  assert.deepEqual(disabled.matches, []);
});

test('redaction handles depth, circular references, arrays, and record prototypes', () => {
  const circular = { token: 'root-token' };
  circular.self = circular;
  const circularReport = redactCliSecretsWithReport(circular);
  const nullPrototype = Object.create(null);
  nullPrototype.secret = 'hidden';
  const date = new Date('2024-01-01T00:00:00.000Z');
  const report = redactCliSecretsWithReport({
    list: [{ accessToken: 'abc123' }],
    circular,
    nullPrototype,
    date,
    nested: { keep: { password: 'too-deep' } }
  }, { maxDepth: 1 });

  assert.equal(report.value.list[0], '[REDACTED]');
  assert.equal(report.value.circular.token, '[REDACTED]');
  assert.equal(report.value.circular.self, '[REDACTED]');
  assert.equal(report.value.nullPrototype.secret, '[REDACTED]');
  assert.equal(report.value.date, date);
  assert.equal(report.value.nested.keep, '[REDACTED]');
  assert.equal(circularReport.value.self, '[REDACTED]');
  assert.equal(circularReport.matches.some((match) => match.path === '$.self' && match.reason === 'circular_reference'), true);
  assert.equal(report.matches.some((match) => match.path === '$.nested.keep' && match.reason === 'max_depth'), true);
  assert.equal(report.matches.some((match) => match.path === '$.list[0]' && match.reason === 'max_depth'), true);
});

test('redaction preserves shared non-cyclic structural values', () => {
  const commandPath = Object.freeze([]);
  const report = redactCliSecretsWithReport({
    command: { path: commandPath },
    commandPath,
    token: 'abc123'
  });

  assert.deepEqual(report.value.command.path, []);
  assert.deepEqual(report.value.commandPath, []);
  assert.equal(report.value.token, '[REDACTED]');
  assert.equal(report.matches.some((match) => match.path === '$.commandPath' && match.reason === 'circular_reference'), false);
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
    payload: { password: 'secret' }
  });

  assert.equal(unsupported.code, 'CLI_SCHEMA_UNSUPPORTED');
  assert.equal(unsupported.fields.schemaVersion, 'cli-core.old.v1');
  assert.equal(Array.isArray(unsupported.fields.supportedSchemaVersions), true);
  assert.equal(unsupported.fields.supportedSchemaVersions.includes('cli-core.run-result.v1'), true);
  assert.equal(failure.schemaVersion, 'cli-core.failure.v1');
  assert.equal(failure.redacted, true);
  assert.equal(failure.diagnostics[1].message, 'handler failed [REDACTED]');
  assert.equal(failure.diagnostics[1].fields.accessToken, '[REDACTED]');
  assert.equal(failure.payload.password, '[REDACTED]');
});

test('failure envelopes report redaction only when diagnostics or payload changed', () => {
  const clean = createCliFailureEnvelope({
    kind: 'validation',
    diagnostics: [{
      code: 'CLI_RUN_HANDLER_FAILED',
      severity: 'error',
      message: 'handler failed',
      fields: { commandPath: ['deploy'] }
    }],
    payload: { visible: true }
  });
  const diagnosticOnly = createCliFailureEnvelope({
    kind: 'validation',
    diagnostics: [{
      code: 'CLI_RUN_HANDLER_FAILED',
      severity: 'error',
      message: 'token=abc123',
      fields: { commandPath: ['deploy'] }
    }],
    payload: { visible: true }
  });

  assert.equal(clean.redacted, false);
  assert.equal(clean.payload.visible, true);
  assert.equal(diagnosticOnly.redacted, true);
  assert.equal(diagnosticOnly.diagnostics[0].message, '[REDACTED]');
});

test('failure helpers map exit kinds and diagnostics to typed failure kinds', () => {
  assert.equal(exitKindToFailureKind('parse_error'), 'parse');
  assert.equal(exitKindToFailureKind('config_error'), 'config');
  assert.equal(exitKindToFailureKind('validation_error'), 'validation');
  assert.equal(exitKindToFailureKind('policy_denied'), 'policy_denial');
  assert.equal(exitKindToFailureKind('cancelled'), 'cancellation');
  assert.equal(exitKindToFailureKind('interrupted'), 'interruption');
  assert.equal(exitKindToFailureKind('timeout'), 'timeout');
  assert.equal(exitKindToFailureKind('external_error'), 'external_error');
  assert.equal(exitKindToFailureKind('internal_error'), 'internal_error');
  assert.equal(exitKindToFailureKind('usage'), 'internal_error');
  assert.equal(failureKindForDiagnostics([
    {
      code: 'CLI_RUN_HANDLER_FAILED',
      severity: 'warning',
      message: 'warning',
      fields: {}
    }
  ]), undefined);
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
      code: 'CLI_PLUGIN_LOAD_FAILED',
      severity: 'error',
      message: 'plugin failed',
      fields: { plugin: 'audit' }
    },
    {
      code: 'CLI_UNKNOWN_COMMAND',
      severity: 'error',
      message: 'unknown command',
      fields: { commandPath: ['bad'] }
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
  assert.equal(failureKindForDiagnostics([
    {
      code: 'CLI_UNKNOWN_OPTION',
      severity: 'error',
      message: 'unknown option',
      fields: { option: '--bad' }
    }
  ]), 'parse');
  assert.equal(failureKindForDiagnostics([
    {
      code: 'CLI_MISSING_POSITIONAL',
      severity: 'error',
      message: 'missing input',
      fields: { name: 'service' }
    }
  ]), 'parse');
  assert.equal(failureKindForDiagnostics([
    {
      code: 'CLI_RUN_CANCELLED',
      severity: 'error',
      message: 'cancelled',
      fields: {}
    }
  ]), 'cancellation');
  assert.equal(failureKindForDiagnostics([
    {
      code: 'CLI_RUN_INTERRUPTED',
      severity: 'error',
      message: 'interrupted',
      fields: {}
    }
  ]), 'interruption');
  assert.equal(failureKindForDiagnostics([
    {
      code: 'CLI_RUN_TIMEOUT',
      severity: 'error',
      message: 'timeout',
      fields: {}
    }
  ]), 'timeout');
  assert.equal(failureKindForDiagnostics([
    {
      code: 'CLI_CONFIG_VALUE_INVALID',
      severity: 'error',
      message: 'bad config',
      fields: {}
    }
  ]), 'config');
  assert.equal(failureKindForDiagnostics([
    {
      code: 'CLI_CONFIG_VALUE_INVALID',
      severity: 'error',
      message: 'bad config',
      fields: {}
    },
    {
      code: 'CLI_UNKNOWN_COMMAND',
      severity: 'error',
      message: 'unknown command',
      fields: { commandPath: ['bad'] }
    }
  ]), 'config');
  assert.equal(failureKindForDiagnostics([
    {
      code: 'CLI_OPTION_BINDING_FAILED',
      severity: 'error',
      message: 'bad flag',
      fields: {}
    }
  ]), 'parse');
  assert.equal(failureKindForDiagnostics([
    {
      code: 'CLI_RUN_HANDLER_FAILED',
      severity: 'error',
      message: 'handler failed',
      fields: {}
    }
  ]), 'external_error');
  assert.equal(failureKindForDiagnostics([
    {
      code: 'CLI_VALIDATION_FAILED',
      severity: 'error',
      message: 'validation failed',
      fields: {}
    }
  ]), 'validation');
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
        artifacts: [{ id: 'summary', kind: 'json', payload: { password: 'secret' } }],
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
  assert.equal(result.artifacts[0].payload.password, '[REDACTED]');
  assert.equal(result.diagnostics[0].message, '[REDACTED]');
  assert.equal(result.diagnostics[0].fields.token, '[REDACTED]');
  assert.equal(unredacted.effects[0].env.SHIP_TOKEN, 'abc123');
});
