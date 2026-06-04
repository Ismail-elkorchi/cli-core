import { defineSchema, parseArgs, toJsonResult, type ParseIssue as ArgvParseIssue } from 'argv-flags';
import {
  createOptionSchema,
  findCliCommand,
  findCliCommandByAlias,
  type CliCommand,
  type CliCommandAliasIndexEntry,
  type CliProgram
} from '../command/index.ts';
import { createCliDiagnostic, hasErrorDiagnostics, type CliDiagnostic } from '../diagnostics.ts';

/**
 * Explicit argv input for parsing.
 */
export interface ParseInput {
  /** Tokens to parse after the executable and binary name have been removed. */
  readonly argv?: readonly string[];
  /** Preserves unknown option tokens without turning them into parse diagnostics. */
  readonly allowUnknownOptions?: boolean;
}

/**
 * Structured parse result returned by parseCli.
 */
export interface ParsedInvocation {
  /** Schema version for this document. */
  readonly schemaVersion: 'cli-core.invocation.v1';
  /** False when command lookup, option binding, or positional binding emitted an error. */
  readonly ok: boolean;
  /** Frozen argv tokens that were parsed. */
  readonly argv: readonly string[];
  /** Matched command, or the root command when lookup failed. */
  readonly command: CliCommand | undefined;
  /** Canonical command path for the invocation. */
  readonly commandPath: readonly string[];
  /** Alias that matched the invocation, if any. */
  readonly usedAlias: ParsedAlias | undefined;
  /** Bound option values and low-level flag issues. */
  readonly options: ParsedCliOptions;
  /** Bound positional values keyed by positional name. */
  readonly positionals: Readonly<Record<string, ParsedPositionalValue>>;
  /** Raw positional values in argv order. */
  readonly positionalList: readonly string[];
  /** Tokens preserved after the pass-through boundary. */
  readonly passThrough: readonly string[];
  /** Parse diagnostics retained as structured data. */
  readonly diagnostics: readonly CliDiagnostic[];
}

/**
 * Alias match captured during command lookup.
 */
export interface ParsedAlias {
  /** Original token from user input. */
  readonly token: string;
  /** Alias path used in argv. */
  readonly path: readonly string[];
  /** Canonical command path for an alias. */
  readonly canonicalPath: readonly string[];
  /** Deprecation marker emitted because this alias was used. */
  readonly deprecated?: boolean | string;
}

/**
 * Option value stored after argv binding.
 */
export type ParsedCliOptionValue = string | number | boolean | readonly string[] | undefined;

/**
 * Positional value stored after argv binding.
 */
export type ParsedPositionalValue = string | readonly string[] | undefined;

/**
 * Normalized argv-flags issue captured in a parsed invocation.
 */
export interface ParseIssue {
  /** Stable machine-readable issue code from argv-flags. */
  readonly code: 'UNKNOWN_FLAG' | 'MISSING_VALUE' | 'INVALID_VALUE' | 'REQUIRED' | 'DUPLICATE' | 'EMPTY_VALUE';
  /** Severity used when computing invocation validity. */
  readonly severity: 'error' | 'warning';
  /** Human-readable issue message. */
  readonly message: string;
  /** Flag token associated with the issue when available. */
  readonly flag?: string;
  /** Option key associated with the issue when available. */
  readonly key?: string;
  /** Raw string value associated with the issue when available. */
  readonly value?: string;
  /** Zero-based argv index associated with the issue when available. */
  readonly index?: number;
}

/**
 * Bound option values and low-level flag issues.
 */
export interface ParsedCliOptions {
  /** Resolved values keyed by public name. */
  readonly values: Readonly<Record<string, ParsedCliOptionValue>>;
  /** Presence map keyed by option name. */
  readonly present: Readonly<Record<string, boolean>>;
  /** Unknown option tokens preserved by parsing. */
  readonly unknown: readonly string[];
  /** Low-level argv-flags issues preserved as data. */
  readonly issues: readonly ParseIssue[];
}

/**
 * Validation envelope that preserves diagnostics as data.
 */
export interface SemanticValidationResult {
  /** False when validation policy rejects diagnostics on the invocation. */
  readonly ok: boolean;
  /** Diagnostics considered by semantic validation. */
  readonly diagnostics: readonly CliDiagnostic[];
}

/**
 * Controls semantic validation policy.
 */
export interface ValidationContext {
  /** Whether warning diagnostics still allow a valid result. */
  readonly allowWarnings?: boolean;
}

interface CommandMatch {
  readonly command: CliCommand | undefined;
  readonly alias: CliCommandAliasIndexEntry | undefined;
  readonly commandPath: readonly string[];
  readonly consumed: number;
  readonly unknownCommand: readonly string[];
}

/**
 * Parses argv into a structured invocation.
 *
 * @remarks
 * Low-level flag parsing stays delegated to argv-flags; cli-core adds command lookup, positional binding, pass-through preservation, and diagnostics.
 */
export function parseCli(program: CliProgram, input: ParseInput = {}): ParsedInvocation {
  const argv = Object.freeze([...(input.argv ?? [])]);
  const { leading, passThrough } = splitPassThrough(argv);
  const match = matchCommand(program, leading);
  const command = match.command ?? program.root;
  const optionTokens = leading.slice(match.consumed);
  const optionResult = bindOptions(command, optionTokens);
  const positionals = bindPositionals(command, optionResult.rest);
  const diagnostics = Object.freeze([
    ...program.diagnostics,
    ...unknownCommandDiagnostics(match),
    ...aliasDiagnostics(match),
    ...optionDiagnostics(optionResult, input.allowUnknownOptions ?? false),
    ...positionals.diagnostics,
    ...passThroughDiagnostics(command, passThrough)
  ]);

  return Object.freeze({
    schemaVersion: 'cli-core.invocation.v1',
    ok: !hasErrorDiagnostics(diagnostics),
    argv,
    command,
    commandPath: command.path,
    usedAlias: buildParsedAlias(match),
    options: optionResult.options,
    positionals: positionals.values,
    positionalList: optionResult.rest,
    passThrough,
    diagnostics
  });
}

/**
 * Validates a parsed invocation against accumulated diagnostics.
 */
export function validateCli(
  program: CliProgram,
  invocation: ParsedInvocation,
  context: ValidationContext = {}
): Promise<SemanticValidationResult> {
  const diagnostics = uniqueDiagnostics([...program.diagnostics, ...invocation.diagnostics]);
  const warningsAreAllowed = context.allowWarnings ?? true;
  const hasWarningDiagnostics = diagnostics.some((item) => item.severity === 'warning');
  return Promise.resolve(Object.freeze({
    ok: !hasErrorDiagnostics(diagnostics) && (warningsAreAllowed || !hasWarningDiagnostics),
    diagnostics
  }));
}

function uniqueDiagnostics(diagnostics: readonly CliDiagnostic[]): readonly CliDiagnostic[] {
  const seen = new Set<CliDiagnostic>();
  const unique: CliDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    if (seen.has(diagnostic)) continue;
    seen.add(diagnostic);
    unique.push(diagnostic);
  }
  return Object.freeze(unique);
}

function splitPassThrough(argv: readonly string[]): { readonly leading: readonly string[]; readonly passThrough: readonly string[] } {
  const index = argv.indexOf('--');
  if (index < 0) {
    return {
      leading: argv,
      passThrough: Object.freeze([])
    };
  }
  return {
    leading: Object.freeze(argv.slice(0, index)),
    passThrough: Object.freeze(argv.slice(index + 1))
  };
}

function matchCommand(program: CliProgram, argv: readonly string[]): CommandMatch {
  const pathTokens = collectLeadingPathTokens(argv);

  // Command lookup is path-prefix based: exact path and alias matches are checked
  // longest-first so `deploy prod` can coexist with `deploy`.
  for (let length = pathTokens.length; length > 0; length -= 1) {
    const candidate = pathTokens.slice(0, length);
    const command = findCliCommand(program, candidate);
    if (command !== undefined) {
      return { command, alias: undefined, commandPath: command.path, consumed: length, unknownCommand: [] };
    }
    const aliasMatch = findCliCommandByAlias(program, candidate);
    if (aliasMatch !== undefined) {
      return {
        command: aliasMatch.command,
        alias: aliasMatch.alias,
        commandPath: aliasMatch.command.path,
        consumed: length,
        unknownCommand: []
      };
    }
  }

  if (pathTokens.length > 0) {
    return {
      command: undefined,
      alias: undefined,
      commandPath: [],
      consumed: 0,
      unknownCommand: Object.freeze([...pathTokens])
    };
  }

  return { command: program.root, alias: undefined, commandPath: [], consumed: 0, unknownCommand: [] };
}

function collectLeadingPathTokens(argv: readonly string[]): readonly string[] {
  const tokens: string[] = [];
  for (const token of argv) {
    if (token.startsWith('-')) break;
    tokens.push(token);
  }
  return Object.freeze(tokens);
}

function bindOptions(command: CliCommand, argv: readonly string[]): {
  readonly options: ParsedCliOptions;
  readonly rest: readonly string[];
} {
  const options = [...command.inheritedOptions, ...command.options];
  const schema = defineSchema(createOptionSchema(options));
  const result = parseArgs(schema, {
    argv,
    allowUnknown: true,
    stopAtDoubleDash: true
  });
  const json = toJsonResult(result);

  return {
    options: Object.freeze({
      values: freezeOptionValues(json.values),
      present: Object.freeze({ ...json.present }),
      unknown: Object.freeze([...json.unknown]),
      issues: freezeParseIssues(json.issues)
    }),
    rest: Object.freeze([...json.rest])
  };
}

function freezeParseIssues(issues: readonly ArgvParseIssue[]): readonly ParseIssue[] {
  return Object.freeze(issues.map((issue) => {
    const normalized: ParseIssue = {
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
      ...(issue.flag === undefined ? {} : { flag: issue.flag }),
      ...(issue.key === undefined ? {} : { key: issue.key }),
      ...(issue.value === undefined ? {} : { value: issue.value }),
      ...(issue.index === undefined ? {} : { index: issue.index })
    };
    return Object.freeze(normalized);
  }));
}

function bindPositionals(command: CliCommand, rest: readonly string[]): {
  readonly values: Readonly<Record<string, ParsedPositionalValue>>;
  readonly diagnostics: readonly CliDiagnostic[];
} {
  const values: Record<string, ParsedPositionalValue> = {};
  const diagnostics: CliDiagnostic[] = [];
  let index = 0;

  for (const positional of command.positionals) {
    if (positional.variadic) {
      const remaining = Object.freeze(rest.slice(index));
      values[positional.name] = remaining;
      index = rest.length;
      if (positional.required && remaining.length === 0) {
        diagnostics.push(
          createCliDiagnostic('CLI_MISSING_POSITIONAL', 'error', 'Required positional input is missing.', {
            commandPath: command.path,
            positional: positional.name
          })
        );
      }
      continue;
    }

    const value = rest.at(index);
    if (value === undefined) {
      values[positional.name] = undefined;
      if (positional.required) {
        diagnostics.push(
          createCliDiagnostic('CLI_MISSING_POSITIONAL', 'error', 'Required positional input is missing.', {
            commandPath: command.path,
            positional: positional.name
          })
        );
      }
      continue;
    }
    values[positional.name] = value;
    index += 1;
  }

  if (index < rest.length) {
    diagnostics.push(
      createCliDiagnostic('CLI_UNEXPECTED_POSITIONAL', 'error', 'Unexpected positional input was provided.', {
        commandPath: command.path,
        values: rest.slice(index)
      })
    );
  }

  return {
    values: Object.freeze(values),
    diagnostics: Object.freeze(diagnostics)
  };
}

function unknownCommandDiagnostics(match: CommandMatch): readonly CliDiagnostic[] {
  if (match.unknownCommand.length === 0) return [];
  return [
    createCliDiagnostic('CLI_UNKNOWN_COMMAND', 'error', 'Command path does not match a known command.', {
      commandPath: match.unknownCommand
    })
  ];
}

function aliasDiagnostics(match: CommandMatch): readonly CliDiagnostic[] {
  if (match.alias === undefined || match.alias.deprecated === undefined) return [];
  return [
    createCliDiagnostic('CLI_DEPRECATED_ALIAS', 'warning', 'Command alias is deprecated.', {
      alias: match.alias.alias,
      aliasPath: match.alias.path,
      commandPath: match.commandPath,
      reason: typeof match.alias.deprecated === 'string' ? match.alias.deprecated : ''
    })
  ];
}

function optionDiagnostics(optionResult: ReturnType<typeof bindOptions>, allowUnknownOptions: boolean): readonly CliDiagnostic[] {
  const diagnostics: CliDiagnostic[] = [];
  for (const issue of optionResult.options.issues) {
    diagnostics.push(
      createCliDiagnostic('CLI_ARGV_FLAG_ISSUE', issue.severity, issue.message, {
        code: issue.code,
        flag: issue.flag ?? '',
        key: issue.key ?? '',
        value: issue.value ?? '',
        index: issue.index ?? -1
      })
    );
  }
  if (!allowUnknownOptions) {
    for (const option of optionResult.options.unknown) {
      diagnostics.push(
        createCliDiagnostic('CLI_UNKNOWN_OPTION', 'error', 'Unknown option was provided.', {
          option
        })
      );
    }
  }
  return Object.freeze(diagnostics);
}

function passThroughDiagnostics(command: CliCommand, passThrough: readonly string[]): readonly CliDiagnostic[] {
  if (passThrough.length === 0 || command.allowPassThrough) return [];
  return [
    createCliDiagnostic('CLI_PASS_THROUGH_UNDECLARED', 'warning', 'Pass-through tokens were preserved for a command that did not declare pass-through behavior.', {
      commandPath: command.path,
      passThrough
    })
  ];
}

function buildParsedAlias(match: CommandMatch): ParsedAlias | undefined {
  if (match.alias === undefined) return undefined;
  const base = {
    token: match.alias.alias,
    path: match.alias.path,
    canonicalPath: match.commandPath
  };
  if (match.alias.deprecated === undefined) return Object.freeze(base);
  return Object.freeze({ ...base, deprecated: match.alias.deprecated });
}

function freezeOptionValues(values: Readonly<Record<string, unknown>>): Readonly<Record<string, ParsedCliOptionValue>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        Array.isArray(value) ? Object.freeze([...value]) : value === null ? undefined : value
      ])
    )
  ) as Readonly<Record<string, ParsedCliOptionValue>>;
}
