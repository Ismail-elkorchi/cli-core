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
  | 'CLI_PASS_THROUGH_UNDECLARED';

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
