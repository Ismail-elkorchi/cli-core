import {
  createCliDiagnostic,
  hasErrorDiagnostics,
  type CliDiagnostic,
  type CliDiagnosticValue
} from '../diagnostics.ts';
import { cliCorePackage } from '../package.ts';

/**
 * Names of schema artifacts shipped by the package.
 */
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

/**
 * Schema versions for public machine-readable documents.
 */
export type CliSchemaVersion =
  | 'cli-core.program.v1'
  | 'cli-core.invocation.v2'
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

/**
 * Descriptor for a shipped schema artifact.
 */
export interface CliSchemaDescriptor {
  /** Stable artifact name used for lookup and package export paths. */
  readonly name: CliSchemaName;
  /** Schema version declared by documents that this artifact validates. */
  readonly version: CliSchemaVersion;
  /** Compatibility stability for this schema. */
  readonly stability: 'public';
  /** Purpose of this schema artifact. */
  readonly purpose: string;
}

/**
 * Versioned envelope for arbitrary cli-core payloads.
 */
export interface CliSchemaEnvelope<TData = unknown> {
  /** Schema version for this document. */
  readonly schemaVersion: 'cli-core.schema-envelope.v1';
  /** Schema version of the wrapped payload. */
  readonly payloadSchemaVersion: CliSchemaVersion;
  /** Name of the package that created the envelope. */
  readonly packageName: string;
  /** Package version that created the envelope. */
  readonly packageVersion: string;
  /** Payload after optional redaction. */
  readonly payload: TData;
}

/**
 * Input used to create a schema envelope.
 */
export interface CliSchemaEnvelopeInput<TData = unknown> {
  /** Schema version of the wrapped payload. */
  readonly payloadSchemaVersion: CliSchemaVersion;
  /** Payload to wrap after optional redaction. */
  readonly payload: TData;
  /** Redaction options applied to returned data. */
  readonly redaction?: CliRedactionOptions;
}

/**
 * Machine-readable failure categories.
 */
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

/**
 * Versioned envelope for failures and diagnostics.
 */
export interface CliFailureEnvelope<TData = unknown> {
  /** Schema version for this document. */
  readonly schemaVersion: 'cli-core.failure.v1';
  /** Name of the package that created the envelope. */
  readonly packageName: string;
  /** Package version that created the failure envelope. */
  readonly packageVersion: string;
  /** Failure envelopes are always non-ok by contract. */
  readonly ok: false;
  /** Failure category used by machine consumers. */
  readonly kind: CliFailureKind;
  /** Diagnostics explaining the failure. */
  readonly diagnostics: readonly CliDiagnostic[];
  /** Optional failure-specific data after redaction. */
  readonly payload: TData;
  /** Redacted data value. */
  readonly redacted: boolean;
}

/**
 * Input used to create a failure envelope.
 */
export interface CliFailureEnvelopeInput<TData = unknown> {
  /** Failure category to place in the envelope. */
  readonly kind: CliFailureKind;
  /** Diagnostics to redact and place in the envelope. */
  readonly diagnostics: readonly CliDiagnostic[];
  /** Optional failure-specific data to redact and place in the envelope. */
  readonly payload?: TData;
  /** Redaction options applied to returned data. */
  readonly redaction?: CliRedactionOptions;
}

/**
 * Options controlling secret redaction.
 */
export interface CliRedactionOptions {
  /** Whether the feature is enabled. */
  readonly enabled?: boolean;
  /** Replacement string used for redaction. */
  readonly replacement?: string;
  /** Key names treated as sensitive. */
  readonly sensitiveKeys?: readonly string[];
  /** String patterns treated as sensitive. */
  readonly stringPatterns?: readonly RegExp[];
  /** Maximum depth preserved before redaction. */
  readonly maxDepth?: number;
}

/**
 * Reasons reported for redaction matches.
 */
export type CliRedactionReason = 'sensitive_key' | 'string_pattern' | 'circular_reference' | 'max_depth';

/**
 * Single redaction match reported by redaction helpers.
 */
export interface CliRedactionMatch {
  /** Path to the value that was redacted. */
  readonly path: string;
  /** Reason associated with this item. */
  readonly reason: CliRedactionReason;
  /** Object key associated with the redaction match. */
  readonly key?: string;
  /** Pattern that matched a sensitive string. */
  readonly pattern?: string;
}

/**
 * Redacted value plus match metadata.
 */
export interface CliRedactionResult<TData = unknown> {
  /** Schema version for this document. */
  readonly schemaVersion: 'cli-core.redaction.v1';
  /** Redacted copy of the original value. */
  readonly value: TData;
  /** Redacted data value. */
  readonly redacted: boolean;
  /** Redaction matches that were applied. */
  readonly matches: readonly CliRedactionMatch[];
}

const schemaDescriptors: readonly CliSchemaDescriptor[] = Object.freeze([
  descriptor('program', 'cli-core.program.v1', 'Compiled immutable command program.'),
  descriptor('invocation', 'cli-core.invocation.v2', 'Parsed command invocation.'),
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
  descriptor('repair-suggestions', 'cli-core.repair-suggestions.v1', 'Repair suggestion result.'),
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

/**
 * Lists schema artifacts shipped by the package.
 */
export function describeCliSchemas(): readonly CliSchemaDescriptor[] {
  return schemaDescriptors;
}

/**
 * Checks whether a string is a supported cli-core schema version.
 */
export function isCliSchemaVersion(value: string): value is CliSchemaVersion {
  return schemaVersionSet.has(value);
}

/**
 * Creates a diagnostic for an unsupported schema version.
 */
export function createUnsupportedSchemaDiagnostic(schemaVersion: string): CliDiagnostic {
  return createCliDiagnostic('CLI_SCHEMA_UNSUPPORTED', 'error', 'Schema version is not supported by this package.', {
    schemaVersion,
    supportedSchemaVersions: schemaDescriptors.map((item) => item.version)
  });
}

/**
 * Wraps a payload in a schema/version envelope.
 */
export function createCliSchemaEnvelope<TData>(input: CliSchemaEnvelopeInput<TData>): CliSchemaEnvelope<TData> {
  return Object.freeze({
    schemaVersion: 'cli-core.schema-envelope.v1' as const,
    payloadSchemaVersion: input.payloadSchemaVersion,
    packageName: cliCorePackage.name,
    packageVersion: cliCorePackage.version,
    payload: redactCliSecrets(input.payload, input.redaction)
  });
}

/**
 * Wraps failure diagnostics and optional data in a schema/version envelope.
 */
export function createCliFailureEnvelope<TData = null>(input: CliFailureEnvelopeInput<TData>): CliFailureEnvelope<TData | null> {
  const diagnosticReport = redactCliSecretsWithReport(input.diagnostics, input.redaction);
  const payloadReport = redactCliSecretsWithReport(input.payload ?? null, input.redaction);

  return Object.freeze({
    schemaVersion: 'cli-core.failure.v1' as const,
    packageName: cliCorePackage.name,
    packageVersion: cliCorePackage.version,
    ok: false as const,
    kind: input.kind,
    diagnostics: diagnosticReport.value as readonly CliDiagnostic[],
    payload: payloadReport.value,
    redacted: diagnosticReport.redacted || payloadReport.redacted
  });
}

/**
 * Redacts sensitive diagnostic messages and fields.
 */
export function redactCliDiagnostics(
  diagnostics: readonly CliDiagnostic[],
  options?: CliRedactionOptions
): readonly CliDiagnostic[] {
  return Object.freeze(diagnostics.map((diagnostic) => redactCliDiagnostic(diagnostic, options)));
}

/**
 * Redacts one diagnostic message and fields.
 */
export function redactCliDiagnostic(diagnostic: CliDiagnostic, options?: CliRedactionOptions): CliDiagnostic {
  const message = redactCliSecrets(diagnostic.message, options);
  const fields = redactCliSecrets(diagnostic.fields, options) as Readonly<Record<string, CliDiagnosticValue>>;
  return createCliDiagnostic(diagnostic.code, diagnostic.severity, message, fields);
}

/**
 * Returns a redacted copy of a JSON-compatible value.
 */
export function redactCliSecrets<TData>(value: TData, options?: CliRedactionOptions): TData {
  return redactCliSecretsWithReport(value, options).value;
}

/**
 * Returns a redacted copy plus match metadata.
 *
 * @example
 * ```ts
 * import { redactCliSecretsWithReport } from '@ismail-elkorchi/cli-core/schema';
 *
 * const report = redactCliSecretsWithReport({
 *   token: 'abc123',
 *   nested: { value: 'password=secret' }
 * });
 *
 * report.redacted; // true
 * report.matches.map((match) => match.path); // ["$.token", "$.nested.value"]
 * ```
 */
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
    active: new WeakSet<object>(),
    cache: new WeakMap<object, unknown>(),
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

/**
 * Maps run exit kind into failure-envelope kind.
 */
export function exitKindToFailureKind(exitKind: string): CliFailureKind {
  if (exitKind === 'parse_error') return 'parse';
  if (exitKind === 'config_error') return 'config';
  if (exitKind === 'validation_error') return 'validation';
  if (exitKind === 'policy_denied') return 'policy_denial';
  if (exitKind === 'cancelled') return 'cancellation';
  if (exitKind === 'interrupted') return 'interruption';
  if (exitKind === 'timeout') return 'timeout';
  if (exitKind === 'external_error') return 'external_error';
  return 'internal_error';
}

/**
 * Infers failure kind from diagnostic codes.
 */
export function failureKindForDiagnostics(diagnostics: readonly CliDiagnostic[]): CliFailureKind | undefined {
  if (!hasErrorDiagnostics(diagnostics)) return undefined;
  const codes = diagnostics.map((diagnostic) => diagnostic.code);
  if (codes.some((code) => code.startsWith('CLI_PLUGIN_'))) return 'plugin_error';
  if (codes.includes('CLI_RUN_CANCELLED')) return 'cancellation';
  if (codes.includes('CLI_RUN_INTERRUPTED')) return 'interruption';
  if (codes.includes('CLI_RUN_TIMEOUT')) return 'timeout';
  if (codes.some((code) => code.startsWith('CLI_CONFIG_'))) return 'config';
  if (
    codes.includes('CLI_OPTION_BINDING_FAILED') ||
    codes.includes('CLI_UNKNOWN_COMMAND') ||
    codes.includes('CLI_UNKNOWN_OPTION') ||
    codes.includes('CLI_MISSING_POSITIONAL')
  ) {
    return 'parse';
  }
  if (codes.some((code) => code.startsWith('CLI_VALIDATION_'))) return 'validation';
  if (codes.includes('CLI_RUN_HANDLER_FAILED')) return 'external_error';
  return 'validation';
}

interface RedactionContext {
  readonly replacement: string;
  readonly keys: readonly string[];
  readonly patterns: readonly RegExp[];
  readonly maxDepth: number;
  readonly active: WeakSet<object>;
  readonly cache: WeakMap<object, unknown>;
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

  if (context.active.has(value)) {
    context.matches.push(Object.freeze({ path, reason: 'circular_reference' as const }));
    return context.replacement;
  }
  if (context.cache.has(value)) return context.cache.get(value);
  context.active.add(value);

  if (Array.isArray(value)) {
    const redactedArray = Object.freeze(value.map((item, index) => redactValue(item, `${path}[${index}]`, depth + 1, undefined, context)));
    context.cache.set(value, redactedArray);
    context.active.delete(value);
    return redactedArray;
  }

  if (!isPlainRecord(value)) {
    context.cache.set(value, value);
    context.active.delete(value);
    return value;
  }

  const entries = Object.entries(value).map(([entryKey, entryValue]) => [
    entryKey,
    redactValue(entryValue, `${path}.${entryKey}`, depth + 1, entryKey, context)
  ]);
  const redactedObject = Object.freeze(Object.fromEntries(entries));
  context.cache.set(value, redactedObject);
  context.active.delete(value);
  return redactedObject;
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
