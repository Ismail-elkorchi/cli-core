import { defineSchema, parseArgs, toJsonResult, type ParseIssue } from 'argv-flags';
import {
  createOptionSchema,
  findCliCommand,
  findCliCommandByAlias,
  type CliCommand,
  type CliCommandAliasIndexEntry,
  type CliProgram
} from '../command/index.js';
import { createCliDiagnostic, hasErrorDiagnostics, type CliDiagnostic } from '../diagnostics.js';

export interface ParseInput {
  readonly argv?: readonly string[];
  readonly allowUnknownOptions?: boolean;
}

export interface ParsedInvocation {
  readonly schemaVersion: 'cli-core.invocation.v1';
  readonly ok: boolean;
  readonly argv: readonly string[];
  readonly command: CliCommand | undefined;
  readonly commandPath: readonly string[];
  readonly usedAlias: ParsedAlias | undefined;
  readonly options: ParsedCliOptions;
  readonly positionals: Readonly<Record<string, ParsedPositionalValue>>;
  readonly positionalList: readonly string[];
  readonly passThrough: readonly string[];
  readonly diagnostics: readonly CliDiagnostic[];
}

export interface ParsedAlias {
  readonly token: string;
  readonly path: readonly string[];
  readonly canonicalPath: readonly string[];
  readonly deprecated?: boolean | string;
}

export type ParsedCliOptionValue = string | number | boolean | readonly string[] | undefined;

export type ParsedPositionalValue = string | readonly string[] | undefined;

export interface ParsedCliOptions {
  readonly values: Readonly<Record<string, ParsedCliOptionValue>>;
  readonly present: Readonly<Record<string, boolean>>;
  readonly unknown: readonly string[];
  readonly issues: readonly ParseIssue[];
}

export interface SemanticValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly CliDiagnostic[];
}

export interface ValidationContext {
  readonly allowWarnings?: boolean;
}

interface CommandMatch {
  readonly command: CliCommand | undefined;
  readonly alias: CliCommandAliasIndexEntry | undefined;
  readonly commandPath: readonly string[];
  readonly consumed: number;
  readonly unknownCommand: readonly string[];
}

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

export async function validateCli(
  program: CliProgram,
  invocation: ParsedInvocation,
  context: ValidationContext = {}
): Promise<SemanticValidationResult> {
  const diagnostics = Object.freeze([...program.diagnostics, ...invocation.diagnostics]);
  const warningsAreAllowed = context.allowWarnings ?? true;
  return Object.freeze({
    ok: !hasErrorDiagnostics(diagnostics) && (warningsAreAllowed || diagnostics.every((item) => item.severity !== 'warning')),
    diagnostics
  });
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
      issues: Object.freeze([...json.issues])
    }),
    rest: Object.freeze([...json.rest])
  };
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
