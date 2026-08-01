/** Severity of a runtime CLI diagnostic. */
export type CliDiagnosticSeverity = 'error' | 'warning';

/** Diagnostic codes emitted directly by cli-core. */
export type CliCoreDiagnosticCode =
  | 'CLI_UNKNOWN_COMMAND'
  | 'CLI_MISSING_POSITIONAL'
  | 'CLI_UNEXPECTED_POSITIONAL'
  | 'CLI_UNKNOWN_FLAG'
  | 'CLI_DEPRECATED_ALIAS'
  | 'CLI_AFTER_DOUBLE_DASH_NOT_ACCEPTED';

/** A structured runtime diagnostic. Binders may use their own stable codes. */
export interface CliDiagnostic<Code extends string = string> {
  readonly code: Code;
  readonly severity: CliDiagnosticSeverity;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}

/** Creates an immutable diagnostic. */
export function createCliDiagnostic<Code extends string>(
  code: Code,
  severity: CliDiagnosticSeverity,
  message: string,
  details: Readonly<Record<string, unknown>> = {}
): CliDiagnostic<Code> {
  return Object.freeze({ code, severity, message, details: Object.freeze({ ...details }) });
}

/** Whether a diagnostic list contains an error. */
export function hasErrorDiagnostics(diagnostics: readonly CliDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}
