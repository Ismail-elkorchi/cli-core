/** Severity of a runtime CLI diagnostic. */
export type CliDiagnosticSeverity = 'error' | 'warning';

interface DiagnosticBase {
  readonly severity: CliDiagnosticSeverity;
  readonly message: string;
}

/** Runtime diagnostics emitted by command and invocation semantics. */
export type CliCoreDiagnostic =
  | (DiagnosticBase & {
      readonly source: 'command';
      readonly code: 'CLI_UNKNOWN_COMMAND';
      readonly token: string;
      readonly argvIndex: number;
      readonly commandPath: readonly string[];
    })
  | (DiagnosticBase & {
      readonly source: 'command';
      readonly code: 'CLI_UNKNOWN_COMMAND_PATH';
      readonly commandPath: readonly string[];
    })
  | (DiagnosticBase & {
      readonly source: 'command';
      readonly code: 'CLI_DEPRECATED_ALIAS';
      readonly alias: string;
      readonly aliasPath: readonly string[];
      readonly commandPath: readonly string[];
      readonly reason?: string;
    })
  | (DiagnosticBase & {
      readonly source: 'command';
      readonly code: 'CLI_DEPRECATED_COMMAND';
      readonly commandPath: readonly string[];
      readonly reason?: string;
    })
  | (DiagnosticBase & {
      readonly source: 'positionals';
      readonly code: 'CLI_MISSING_POSITIONAL';
      readonly commandPath: readonly string[];
      readonly positional: string;
    })
  | (DiagnosticBase & {
      readonly source: 'positionals';
      readonly code: 'CLI_UNEXPECTED_POSITIONAL';
      readonly commandPath: readonly string[];
      readonly values: readonly string[];
    })
  | (DiagnosticBase & {
      readonly source: 'invocation';
      readonly code: 'CLI_UNKNOWN_FLAG';
      readonly flag: string;
      readonly argvElement: string;
      readonly argvIndex: number;
      readonly offset?: number;
      readonly inlineValue?: string;
      readonly suggestions?: readonly string[];
    })
  | (DiagnosticBase & {
      readonly source: 'invocation';
      readonly code: 'CLI_AFTER_DOUBLE_DASH_NOT_ACCEPTED';
      readonly commandPath: readonly string[];
    })
  | (DiagnosticBase & {
      readonly source: 'invocation';
      readonly code: 'CLI_INVALID_BINDER_RESULT';
      readonly stage: 'scan' | 'bind' | 'structured';
      readonly reason: string;
    });

/** Diagnostic emitted by an external option binder. */
export interface CliOptionDiagnostic<Code extends string = string> extends DiagnosticBase {
  readonly source: 'option';
  readonly code: Code;
  readonly details: Readonly<Record<string, unknown>>;
}

/** Structured runtime diagnostic discriminated by `source` and `code`. */
export type CliDiagnostic = CliCoreDiagnostic | CliOptionDiagnostic;

/** Creates an immutable diagnostic owned by an option binder. */
export function createCliOptionDiagnostic<Code extends string>(
  code: Code,
  severity: CliDiagnosticSeverity,
  message: string,
  details: Readonly<Record<string, unknown>> = {}
): CliOptionDiagnostic<Code> {
  return Object.freeze({
    source: 'option',
    code,
    severity,
    message,
    details: Object.freeze({ ...details })
  });
}

/** Whether a diagnostic list contains an error. */
export function hasErrorDiagnostics(diagnostics: readonly CliDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}
