import {
  findCliCommand,
  findCliCommandByAlias,
  type CliCommand,
  type CliCommandAliasIndexEntry,
  type CliOption,
  type CliProgram
} from '../command/index.ts';
import {
  createCliDiagnostic,
  hasErrorDiagnostics,
  type CliDiagnostic
} from '../diagnostics.ts';

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
 * Input supplied to an option binder after command routing.
 */
export interface CliOptionBindingInput {
  /** Matched immutable command, suitable as a compiled-parser cache key. */
  readonly command: CliCommand;
  /** Compiled global and local options available to the matched command. */
  readonly options: readonly CliOption[];
  /** Tokens beginning immediately after the matched command path. */
  readonly argv: readonly string[];
  /** Index of the first supplied token in the complete invocation argv. */
  readonly argvOffset: number;
}

/**
 * Unknown option retained by an option binder.
 */
export interface CliUnknownOption {
  /** Complete argv element containing the unknown option. */
  readonly argvElement: string;
  /** Parsed unknown option spelling. */
  readonly option: string;
  /** Index in the complete invocation argv. */
  readonly argvIndex: number;
  /** Offset of a member inside a clustered argv element, when applicable. */
  readonly offset?: number;
}

/**
 * Parser-independent result returned by an option binder.
 */
export interface CliOptionBindingResult {
  /** Decoded values keyed by logical option name. */
  readonly values: Readonly<Record<string, ParsedCliOptionValue>>;
  /** Whether each logical option occurred explicitly. */
  readonly present: Readonly<Record<string, boolean>>;
  /** Raw positional tokens retained in input order. */
  readonly positionals: readonly string[];
  /** Tokens following the exact `--` boundary. */
  readonly afterDoubleDash: readonly string[];
  /** Unknown options retained with their original locations. */
  readonly unknownOptions: readonly CliUnknownOption[];
  /** Option-binding diagnostics already translated into cli-core diagnostics. */
  readonly diagnostics: readonly CliDiagnostic[];
}

/**
 * Adapter that binds option tokens without coupling cli-core to a parser implementation.
 */
export type CliOptionBinder = (input: CliOptionBindingInput) => CliOptionBindingResult;

/**
 * Reusable command-aware invocation parser.
 */
export interface CliInvocationParser {
  /** Parses an explicit argv vector into a cli-core invocation. */
  readonly parse: (program: CliProgram, input?: ParseInput) => ParsedInvocation;
}

/**
 * Structured invocation produced by a command-aware parser.
 */
export interface ParsedInvocation {
  /** Schema version for this document. */
  readonly schemaVersion: 'cli-core.invocation.v2';
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
  /** Bound option values and unknown option locations. */
  readonly options: ParsedCliOptions;
  /** Bound positional values keyed by positional name. */
  readonly positionals: Readonly<Record<string, ParsedPositionalValue>>;
  /** Raw positional values in argv order. */
  readonly positionalList: readonly string[];
  /** Tokens preserved after the exact `--` boundary. */
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
 * Option value stored after option binding.
 */
export type ParsedCliOptionValue = string | number | boolean | readonly string[] | undefined;

/**
 * Positional value stored after invocation binding.
 */
export type ParsedPositionalValue = string | readonly string[] | undefined;

/**
 * Bound option values and unknown option locations.
 */
export interface ParsedCliOptions {
  /** Resolved values keyed by public name. */
  readonly values: Readonly<Record<string, ParsedCliOptionValue>>;
  /** Presence map keyed by option name. */
  readonly present: Readonly<Record<string, boolean>>;
  /** Unknown options preserved by parsing. */
  readonly unknown: readonly CliUnknownOption[];
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
  readonly consumed: number;
  readonly unknownCommand: readonly string[];
}

/**
 * Creates a reusable invocation parser from an explicit option-binding adapter.
 */
export function createCliInvocationParser(bindOptions: CliOptionBinder): CliInvocationParser {
  return Object.freeze({
    parse(program: CliProgram, input: ParseInput = {}): ParsedInvocation {
      return parseInvocation(program, bindOptions, input);
    }
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

function parseInvocation(program: CliProgram, bindOptions: CliOptionBinder, input: ParseInput): ParsedInvocation {
  const argv = Object.freeze([...(input.argv ?? [])]);
  const match = matchCommand(program, argv);
  const command = match.command ?? program.root;
  const optionTokens = Object.freeze(argv.slice(match.consumed));
  const optionResult = freezeOptionBindingResult(bindOptions({
    command,
    options: Object.freeze([...command.inheritedOptions, ...command.options]),
    argv: optionTokens,
    argvOffset: match.consumed
  }));
  const positionals = bindPositionals(command, optionResult.positionals);
  const diagnostics = Object.freeze([
    ...program.diagnostics,
    ...unknownCommandDiagnostics(match),
    ...aliasDiagnostics(match),
    ...optionResult.diagnostics,
    ...unknownOptionDiagnostics(optionResult, input.allowUnknownOptions ?? false),
    ...positionals.diagnostics,
    ...passThroughDiagnostics(command, optionResult.afterDoubleDash)
  ]);

  return Object.freeze({
    schemaVersion: 'cli-core.invocation.v2',
    ok: !hasErrorDiagnostics(diagnostics),
    argv,
    command,
    commandPath: command.path,
    usedAlias: buildParsedAlias(match),
    options: Object.freeze({
      values: optionResult.values,
      present: optionResult.present,
      unknown: optionResult.unknownOptions
    }),
    positionals: positionals.values,
    positionalList: optionResult.positionals,
    passThrough: optionResult.afterDoubleDash,
    diagnostics
  });
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

function matchCommand(program: CliProgram, argv: readonly string[]): CommandMatch {
  const pathTokens = collectLeadingPathTokens(argv);

  for (let length = pathTokens.length; length > 0; length -= 1) {
    const candidate = pathTokens.slice(0, length);
    const command = findCliCommand(program, candidate);
    if (command !== undefined) {
      return { command, alias: undefined, consumed: length, unknownCommand: [] };
    }
    const aliasMatch = findCliCommandByAlias(program, candidate);
    if (aliasMatch !== undefined) {
      return {
        command: aliasMatch.command,
        alias: aliasMatch.alias,
        consumed: length,
        unknownCommand: []
      };
    }
  }

  return { command: undefined, alias: undefined, consumed: 0, unknownCommand: pathTokens };
}

function collectLeadingPathTokens(argv: readonly string[]): readonly string[] {
  const tokens: string[] = [];
  for (const token of argv) {
    if (token.startsWith('-')) break;
    tokens.push(token);
  }
  return Object.freeze(tokens);
}

function freezeOptionBindingResult(result: CliOptionBindingResult): CliOptionBindingResult {
  return Object.freeze({
    values: freezeOptionValues(result.values),
    present: Object.freeze({ ...result.present }),
    positionals: Object.freeze([...result.positionals]),
    afterDoubleDash: Object.freeze([...result.afterDoubleDash]),
    unknownOptions: Object.freeze(result.unknownOptions.map((option) => Object.freeze({ ...option }))),
    diagnostics: Object.freeze([...result.diagnostics])
  });
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
      commandPath: match.command!.path,
      reason: typeof match.alias.deprecated === 'string' ? match.alias.deprecated : ''
    })
  ];
}

function unknownOptionDiagnostics(
  optionResult: CliOptionBindingResult,
  allowUnknownOptions: boolean
): readonly CliDiagnostic[] {
  if (allowUnknownOptions) return [];
  return Object.freeze(optionResult.unknownOptions.map((unknown) =>
    createCliDiagnostic('CLI_UNKNOWN_OPTION', 'error', 'Unknown option was provided.', {
      option: unknown.option,
      argvElement: unknown.argvElement,
      argvIndex: unknown.argvIndex,
      ...(unknown.offset === undefined ? {} : { offset: unknown.offset })
    })
  ));
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
    canonicalPath: match.command!.path
  };
  if (match.alias.deprecated === undefined) return Object.freeze(base);
  return Object.freeze({ ...base, deprecated: match.alias.deprecated });
}

function freezeOptionValues(
  values: Readonly<Record<string, ParsedCliOptionValue>>
): Readonly<Record<string, ParsedCliOptionValue>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      Array.isArray(value) ? Object.freeze([...value]) : value
    ])
  )) as Readonly<Record<string, ParsedCliOptionValue>>;
}
