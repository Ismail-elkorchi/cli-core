/**
 * Severity level for a cli-core diagnostic.
 */
export type CliDiagnosticSeverity = 'error' | 'warning';

/**
 * Stable machine-readable diagnostic codes emitted by cli-core.
 */
export type CliDiagnosticCode =
  | 'CLI_DUPLICATE_COMMAND_PATH'
  | 'CLI_DUPLICATE_COMMAND_ALIAS'
  | 'CLI_ALIAS_CONFLICTS_WITH_COMMAND'
  | 'CLI_COMMAND_NAME_INVALID'
  | 'CLI_COMMAND_ALIAS_INVALID'
  | 'CLI_OPTION_NAME_INVALID'
  | 'CLI_OPTION_NAME_DUPLICATE'
  | 'CLI_OPTION_FLAG_INVALID'
  | 'CLI_OPTION_FLAG_DUPLICATE'
  | 'CLI_POSITIONAL_INVALID'
  | 'CLI_UNKNOWN_COMMAND'
  | 'CLI_MISSING_POSITIONAL'
  | 'CLI_UNEXPECTED_POSITIONAL'
  | 'CLI_UNKNOWN_OPTION'
  | 'CLI_OPTION_BINDING_FAILED'
  | 'CLI_VALIDATION_FAILED'
  | 'CLI_DEPRECATED_ALIAS'
  | 'CLI_PASS_THROUGH_UNDECLARED'
  | 'CLI_CONFIG_FILE_INVALID'
  | 'CLI_CONFIG_DISCOVERY_FAILED'
  | 'CLI_CONFIG_KEY_UNKNOWN'
  | 'CLI_CONFIG_VALUE_INVALID'
  | 'CLI_CONFIG_FIELD_DEPRECATED'
  | 'CLI_CONFIG_MIGRATION_UNCHANGED'
  | 'CLI_PLUGIN_INVALID_MANIFEST'
  | 'CLI_PLUGIN_DUPLICATE_NAME'
  | 'CLI_PLUGIN_CORE_VERSION_UNSUPPORTED'
  | 'CLI_PLUGIN_RUNTIME_UNSUPPORTED'
  | 'CLI_PLUGIN_UNTRUSTED'
  | 'CLI_PLUGIN_CAPABILITY_POLICY_REQUIRED'
  | 'CLI_PLUGIN_CAPABILITY_BLOCKED'
  | 'CLI_PLUGIN_COMMAND_CONFLICT'
  | 'CLI_PLUGIN_COMMAND_REJECTED'
  | 'CLI_PLUGIN_HOOK_ORDER_CYCLE'
  | 'CLI_PLUGIN_LOAD_FAILED'
  | 'CLI_PLUGIN_MODULE_MANIFEST_MISMATCH'
  | 'CLI_PLUGIN_HOOK_MISSING'
  | 'CLI_PLUGIN_HOOK_FAILED'
  | 'CLI_RUN_HANDLER_MISSING'
  | 'CLI_RUN_HANDLER_FAILED'
  | 'CLI_RUN_CANCELLED'
  | 'CLI_RUN_INTERRUPTED'
  | 'CLI_RUN_TIMEOUT'
  | 'CLI_RUN_INVALID_EFFECT'
  | 'CLI_RUN_EVENT_SINK_FAILED'
  | 'CLI_EFFECT_HOST_MISSING'
  | 'CLI_EFFECT_DENIED'
  | 'CLI_EFFECT_APPLY_FAILED'
  | 'CLI_SCHEMA_UNSUPPORTED';

/**
 * JSON-compatible diagnostic field value.
 */
export type CliDiagnosticValue =
  | null
  | boolean
  | number
  | string
  | readonly CliDiagnosticValue[]
  | { readonly [key: string]: CliDiagnosticValue };

/**
 * Structured diagnostic emitted by cli-core APIs.
 */
export interface CliDiagnostic {
  /** Stable machine-readable diagnostic code. */
  readonly code: CliDiagnosticCode;
  /** Diagnostic severity. */
  readonly severity: CliDiagnosticSeverity;
  /** Human-readable diagnostic message. */
  readonly message: string;
  /** Structured diagnostic fields. */
  readonly fields: Readonly<Record<string, CliDiagnosticValue>>;
}

/**
 * Creates an immutable cli-core diagnostic.
 */
export function createCliDiagnostic(
  code: CliDiagnosticCode,
  severity: CliDiagnosticSeverity,
  message: string,
  fields: Readonly<Record<string, CliDiagnosticValue>>
): CliDiagnostic {
  return Object.freeze({
    code,
    severity,
    message,
    fields: freezeDiagnosticRecord(fields)
  });
}

/**
 * Checks diagnostics for error severity without inspecting messages.
 */
export function hasErrorDiagnostics(diagnostics: readonly CliDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function freezeDiagnosticValue(value: CliDiagnosticValue): CliDiagnosticValue {
  if (Array.isArray(value)) {
    const items = value as readonly CliDiagnosticValue[];
    return Object.freeze(items.map((item) => freezeDiagnosticValue(item)));
  }
  if (value !== null && typeof value === 'object') {
    return freezeDiagnosticRecord(value as Readonly<Record<string, CliDiagnosticValue>>);
  }
  return value;
}

function freezeDiagnosticRecord(
  record: Readonly<Record<string, CliDiagnosticValue>>
): Readonly<Record<string, CliDiagnosticValue>> {
  return Object.freeze(
    Object.fromEntries(Object.entries(record).map(([key, value]) => [key, freezeDiagnosticValue(value)]))
  ) as Readonly<Record<string, CliDiagnosticValue>>;
}
