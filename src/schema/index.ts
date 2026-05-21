import {
  createCliDiagnostic,
  hasErrorDiagnostics,
  type CliDiagnostic,
  type CliDiagnosticValue
} from '../diagnostics.js';
import { cliCorePackage } from '../package.js';

export { cliCorePackage };
export type { CliCorePackage } from '../package.js';

export type CliSchemaName =
  | 'program'
  | 'invocation'
  | 'semantic-validation'
  | 'help'
  | 'version'
  | 'manifest'
  | 'config-resolution'
  | 'config-discovery'
  | 'completion'
  | 'completion-protocol'
  | 'completion-request'
  | 'completion-response'
  | 'completion-command'
  | 'completion-script'
  | 'completion-install-plan'
  | 'repair-suggestions'
  | 'plugin'
  | 'plugin-command-application'
  | 'run-result'
  | 'run-event'
  | 'run-effect'
  | 'artifact'
  | 'diagnostic'
  | 'effect-application'
  | 'schema-envelope'
  | 'failure'
  | 'redaction';

export type CliSchemaVersion =
  | 'cli-core.program.v1'
  | 'cli-core.invocation.v1'
  | 'cli-core.semantic-validation.v1'
  | 'cli-core.help.v1'
  | 'cli-core.version.v1'
  | 'cli-core.manifest.v1'
  | 'cli-core.config-resolution.v1'
  | 'cli-core.config-discovery.v1'
  | 'cli-core.completion.v1'
  | 'cli-core.completion-protocol.v1'
  | 'cli-core.completion-request.v1'
  | 'cli-core.completion-response.v1'
  | 'cli-core.completion-command.v1'
  | 'cli-core.completion-script.v1'
  | 'cli-core.completion-install-plan.v1'
  | 'cli-core.repair-suggestions.v1'
  | 'cli-core.plugin.v1'
  | 'cli-core.plugin-command-application.v1'
  | 'cli-core.run-result.v1'
  | 'cli-core.run-event.v1'
  | 'cli-core.run-effect.v1'
  | 'cli-core.artifact.v1'
  | 'cli-core.diagnostic.v1'
  | 'cli-core.effect-application.v1'
  | 'cli-core.schema-envelope.v1'
  | 'cli-core.failure.v1'
  | 'cli-core.redaction.v1';

export interface CliSchemaDescriptor {
  readonly name: CliSchemaName;
  readonly version: CliSchemaVersion;
  readonly stability: 'public';
  readonly purpose: string;
}

export interface CliSchemaEnvelope<TData = unknown> {
  readonly schemaVersion: 'cli-core.schema-envelope.v1';
  readonly payloadSchemaVersion: CliSchemaVersion;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly data: TData;
}

export interface CliSchemaEnvelopeInput<TData = unknown> {
  readonly payloadSchemaVersion: CliSchemaVersion;
  readonly data: TData;
  readonly redaction?: CliRedactionOptions;
}

export type CliFailureKind =
  | 'parse'
  | 'config'
  | 'validation'
  | 'policy_denial'
  | 'cancellation'
  | 'interruption'
  | 'timeout'
  | 'plugin_error'
  | 'external_error'
  | 'internal_error';

export interface CliFailureEnvelope<TData = unknown> {
  readonly schemaVersion: 'cli-core.failure.v1';
  readonly packageName: string;
  readonly packageVersion: string;
  readonly ok: false;
  readonly kind: CliFailureKind;
  readonly diagnostics: readonly CliDiagnostic[];
  readonly data: TData;
  readonly redacted: boolean;
}

export interface CliFailureEnvelopeInput<TData = unknown> {
  readonly kind: CliFailureKind;
  readonly diagnostics: readonly CliDiagnostic[];
  readonly data?: TData;
  readonly redaction?: CliRedactionOptions;
}

export interface CliRedactionOptions {
  readonly enabled?: boolean;
  readonly replacement?: string;
  readonly sensitiveKeys?: readonly string[];
  readonly stringPatterns?: readonly RegExp[];
  readonly maxDepth?: number;
}

export type CliRedactionReason = 'sensitive_key' | 'string_pattern' | 'circular_reference' | 'max_depth';

export interface CliRedactionMatch {
  readonly path: string;
  readonly reason: CliRedactionReason;
  readonly key?: string;
  readonly pattern?: string;
}

export interface CliRedactionResult<TData = unknown> {
  readonly schemaVersion: 'cli-core.redaction.v1';
  readonly value: TData;
  readonly redacted: boolean;
  readonly matches: readonly CliRedactionMatch[];
}

const schemaDescriptors: readonly CliSchemaDescriptor[] = Object.freeze([
  descriptor('program', 'cli-core.program.v1', 'Compiled immutable command program.'),
  descriptor('invocation', 'cli-core.invocation.v1', 'Parsed command invocation.'),
  descriptor('semantic-validation', 'cli-core.semantic-validation.v1', 'Semantic validation result.'),
  descriptor('help', 'cli-core.help.v1', 'Structured help document.'),
  descriptor('version', 'cli-core.version.v1', 'Structured version document.'),
  descriptor('manifest', 'cli-core.manifest.v1', 'Command manifest document.'),
  descriptor('config-resolution', 'cli-core.config-resolution.v1', 'Resolved config values and provenance.'),
  descriptor('config-discovery', 'cli-core.config-discovery.v1', 'Host-driven config input discovery.'),
  descriptor('completion', 'cli-core.completion.v1', 'Completion candidate payload.'),
  descriptor('completion-protocol', 'cli-core.completion-protocol.v1', 'Completion bridge command protocol.'),
  descriptor('completion-request', 'cli-core.completion-request.v1', 'Completion bridge request.'),
  descriptor('completion-response', 'cli-core.completion-response.v1', 'Completion bridge response.'),
  descriptor('completion-command', 'cli-core.completion-command.v1', 'Completion command protocol.'),
  descriptor('completion-script', 'cli-core.completion-script.v1', 'Shell completion script payload.'),
  descriptor('completion-install-plan', 'cli-core.completion-install-plan.v1', 'Data-only completion install plan.'),
  descriptor('repair-suggestions', 'cli-core.repair-suggestions.v1', 'Repair suggestion list.'),
  descriptor('plugin', 'cli-core.plugin.v1', 'Plugin manifest.'),
  descriptor('plugin-command-application', 'cli-core.plugin-command-application.v1', 'Plugin command contribution result.'),
  descriptor('run-result', 'cli-core.run-result.v1', 'Run result envelope.'),
  descriptor('run-event', 'cli-core.run-event.v1', 'Run event envelope.'),
  descriptor('run-effect', 'cli-core.run-effect.v1', 'Run effect envelope.'),
  descriptor('artifact', 'cli-core.artifact.v1', 'Run artifact envelope.'),
  descriptor('diagnostic', 'cli-core.diagnostic.v1', 'Typed diagnostic.'),
  descriptor('effect-application', 'cli-core.effect-application.v1', 'Effect application report.'),
  descriptor('schema-envelope', 'cli-core.schema-envelope.v1', 'Generic schema/version wrapper.'),
  descriptor('failure', 'cli-core.failure.v1', 'Typed failure envelope.'),
  descriptor('redaction', 'cli-core.redaction.v1', 'Secret redaction report.')
]);

const schemaVersionSet: ReadonlySet<string> = new Set(schemaDescriptors.map((item) => item.version));
const defaultSensitiveKeys = Object.freeze([
  'password',
  'passwd',
  'passphrase',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'secret',
  'private_key',
  'authorization',
  'cookie',
  'session'
]);
const defaultStringPatterns = Object.freeze([
  /(?:password|passwd|passphrase|token|api[_-]?key|secret)=([^\s,;&]+)/gi,
  /(?:bearer|basic)\s+[a-z0-9._~+/-]+=*/gi
]);

export function describeCliSchemas(): readonly CliSchemaDescriptor[] {
  return schemaDescriptors;
}

export function isCliSchemaVersion(value: string): value is CliSchemaVersion {
  return schemaVersionSet.has(value);
}

export function createUnsupportedSchemaDiagnostic(schemaVersion: string): CliDiagnostic {
  return createCliDiagnostic('CLI_SCHEMA_UNSUPPORTED', 'error', 'Schema version is not supported by this package.', {
    schemaVersion,
    supportedSchemaVersions: schemaDescriptors.map((item) => item.version)
  });
}

export function createCliSchemaEnvelope<TData>(input: CliSchemaEnvelopeInput<TData>): CliSchemaEnvelope<TData> {
  return Object.freeze({
    schemaVersion: 'cli-core.schema-envelope.v1' as const,
    payloadSchemaVersion: input.payloadSchemaVersion,
    packageName: cliCorePackage.name,
    packageVersion: cliCorePackage.version,
    data: redactCliSecrets(input.data, input.redaction)
  });
}

export function createCliFailureEnvelope<TData = null>(input: CliFailureEnvelopeInput<TData>): CliFailureEnvelope<TData | null> {
  const diagnosticReport = redactCliSecretsWithReport(input.diagnostics, input.redaction);
  const dataReport = redactCliSecretsWithReport(input.data ?? null, input.redaction);

  return Object.freeze({
    schemaVersion: 'cli-core.failure.v1' as const,
    packageName: cliCorePackage.name,
    packageVersion: cliCorePackage.version,
    ok: false as const,
    kind: input.kind,
    diagnostics: diagnosticReport.value as readonly CliDiagnostic[],
    data: dataReport.value,
    redacted: diagnosticReport.redacted || dataReport.redacted
  });
}

export function redactCliDiagnostics(
  diagnostics: readonly CliDiagnostic[],
  options?: CliRedactionOptions
): readonly CliDiagnostic[] {
  return Object.freeze(diagnostics.map((diagnostic) => redactCliDiagnostic(diagnostic, options)));
}

export function redactCliDiagnostic(diagnostic: CliDiagnostic, options?: CliRedactionOptions): CliDiagnostic {
  const message = redactCliSecrets(diagnostic.message, options);
  const fields = redactCliSecrets(diagnostic.fields, options) as Readonly<Record<string, CliDiagnosticValue>>;
  return createCliDiagnostic(diagnostic.code, diagnostic.severity, message, fields);
}

export function redactCliSecrets<TData>(value: TData, options?: CliRedactionOptions): TData {
  return redactCliSecretsWithReport(value, options).value;
}

export function redactCliSecretsWithReport<TData>(value: TData, options?: CliRedactionOptions): CliRedactionResult<TData> {
  if (options?.enabled === false) {
    return Object.freeze({
      schemaVersion: 'cli-core.redaction.v1' as const,
      value,
      redacted: false,
      matches: Object.freeze([])
    });
  }

  const context: RedactionContext = {
    replacement: options?.replacement ?? '[REDACTED]',
    keys: Object.freeze([...(options?.sensitiveKeys ?? defaultSensitiveKeys)].map((key) => normalizeKey(key))),
    patterns: Object.freeze([...(options?.stringPatterns ?? defaultStringPatterns)]),
    maxDepth: options?.maxDepth ?? 64,
    seen: new WeakSet<object>(),
    matches: []
  };
  const redacted = redactValue(value, '$', 0, undefined, context) as TData;

  return Object.freeze({
    schemaVersion: 'cli-core.redaction.v1' as const,
    value: redacted,
    redacted: context.matches.length > 0,
    matches: Object.freeze([...context.matches])
  });
}

export function exitKindToFailureKind(exitKind: string): CliFailureKind {
  if (exitKind === 'usage') return 'parse';
  if (exitKind === 'policy_denied') return 'policy_denial';
  if (exitKind === 'cancelled') return 'cancellation';
  if (exitKind === 'interrupted') return 'interruption';
  if (exitKind === 'timeout') return 'timeout';
  if (exitKind === 'external_error') return 'external_error';
  return 'internal_error';
}

export function failureKindForDiagnostics(diagnostics: readonly CliDiagnostic[]): CliFailureKind | undefined {
  if (!hasErrorDiagnostics(diagnostics)) return undefined;
  const codes = diagnostics.map((diagnostic) => diagnostic.code);
  if (codes.some((code) => code.startsWith('CLI_PLUGIN_'))) return 'plugin_error';
  if (codes.includes('CLI_RUN_CANCELLED')) return 'cancellation';
  if (codes.includes('CLI_RUN_INTERRUPTED')) return 'interruption';
  if (codes.includes('CLI_RUN_TIMEOUT')) return 'timeout';
  if (codes.includes('CLI_ARGV_FLAG_ISSUE')) return 'config';
  if (codes.includes('CLI_UNKNOWN_COMMAND') || codes.includes('CLI_UNKNOWN_OPTION') || codes.includes('CLI_MISSING_POSITIONAL')) {
    return 'parse';
  }
  return 'validation';
}

interface RedactionContext {
  readonly replacement: string;
  readonly keys: readonly string[];
  readonly patterns: readonly RegExp[];
  readonly maxDepth: number;
  readonly seen: WeakSet<object>;
  readonly matches: CliRedactionMatch[];
}

function descriptor(name: CliSchemaName, version: CliSchemaVersion, purpose: string): CliSchemaDescriptor {
  return Object.freeze({ name, version, stability: 'public' as const, purpose });
}

function redactValue(
  value: unknown,
  path: string,
  depth: number,
  key: string | undefined,
  context: RedactionContext
): unknown {
  if (key !== undefined && isSensitiveKey(key, context.keys)) {
    context.matches.push(Object.freeze({ path, reason: 'sensitive_key' as const, key }));
    return context.replacement;
  }

  if (typeof value === 'string') return redactString(value, path, context);
  if (value === null || typeof value !== 'object') return value;

  if (depth > context.maxDepth) {
    context.matches.push(Object.freeze({ path, reason: 'max_depth' as const }));
    return context.replacement;
  }

  if (context.seen.has(value)) {
    context.matches.push(Object.freeze({ path, reason: 'circular_reference' as const }));
    return context.replacement;
  }
  context.seen.add(value);

  if (Array.isArray(value)) {
    return Object.freeze(value.map((item, index) => redactValue(item, `${path}[${index}]`, depth + 1, undefined, context)));
  }

  if (!isPlainRecord(value)) return value;

  const entries = Object.entries(value).map(([entryKey, entryValue]) => [
    entryKey,
    redactValue(entryValue, `${path}.${entryKey}`, depth + 1, entryKey, context)
  ]);
  return Object.freeze(Object.fromEntries(entries));
}

function redactString(value: string, path: string, context: RedactionContext): string {
  let output = value;
  for (const pattern of context.patterns) {
    pattern.lastIndex = 0;
    if (!pattern.test(output)) continue;
    context.matches.push(Object.freeze({ path, reason: 'string_pattern' as const, pattern: pattern.source }));
    pattern.lastIndex = 0;
    output = output.replace(pattern, context.replacement);
  }
  return output;
}

function isSensitiveKey(key: string, sensitiveKeys: readonly string[]): boolean {
  const normalized = normalizeKey(key);
  return sensitiveKeys.some((candidate) => normalized.includes(candidate));
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

function isPlainRecord(value: object): value is Readonly<Record<string, unknown>> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
