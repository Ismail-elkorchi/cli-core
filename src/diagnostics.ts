export type CliDiagnosticSeverity = 'error' | 'warning';

export type CliDiagnosticCode =
  | 'CLI_DUPLICATE_COMMAND_PATH'
  | 'CLI_DUPLICATE_COMMAND_ALIAS'
  | 'CLI_ALIAS_CONFLICTS_WITH_COMMAND'
  | 'CLI_UNKNOWN_COMMAND'
  | 'CLI_MISSING_POSITIONAL'
  | 'CLI_UNEXPECTED_POSITIONAL'
  | 'CLI_UNKNOWN_OPTION'
  | 'CLI_ARGV_FLAG_ISSUE'
  | 'CLI_DEPRECATED_ALIAS'
  | 'CLI_PASS_THROUGH_UNDECLARED'
  | 'CLI_PLUGIN_INVALID_MANIFEST'
  | 'CLI_PLUGIN_DUPLICATE_NAME'
  | 'CLI_PLUGIN_CORE_VERSION_UNSUPPORTED'
  | 'CLI_PLUGIN_RUNTIME_UNSUPPORTED'
  | 'CLI_PLUGIN_CAPABILITY_BLOCKED'
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
  | 'CLI_SCHEMA_UNSUPPORTED';

export type CliDiagnosticValue =
  | null
  | boolean
  | number
  | string
  | readonly CliDiagnosticValue[]
  | { readonly [key: string]: CliDiagnosticValue };

export interface CliDiagnostic {
  readonly code: CliDiagnosticCode;
  readonly severity: CliDiagnosticSeverity;
  readonly message: string;
  readonly fields: Readonly<Record<string, CliDiagnosticValue>>;
}

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
