import {
  findCliCommandChildren,
  type CliAlias,
  type CliCommand,
  type CliOption,
  type CliProgram
} from '../command/index.ts';
import { createCliDiagnostic, hasErrorDiagnostics, type CliDiagnostic } from '../diagnostics.ts';

/** Settings for one command-aware parse. */
export interface ParseInput {
  /** Tokens after the executable and program name. */
  readonly argv?: readonly string[];
  /** Whether indexed unknown flags are accepted. */
  readonly unknownFlagPolicy?: 'error' | 'collect';
}

/** Input supplied to a low-level option binder after command routing. */
export interface CliOptionBindingInput {
  readonly command: CliCommand;
  readonly options: readonly CliOption[];
  /** Tokens left after command tokens were removed. */
  readonly argv: readonly string[];
  /** Complete-invocation index for each element in `argv`. */
  readonly argvIndexes: readonly number[];
}

/** One unknown option preserved at its original argv location. */
export interface CliUnknownFlag {
  readonly argvElement: string;
  readonly flag: string;
  readonly argvIndex: number;
  readonly offset?: number;
  readonly inlineValue?: string;
}

/** Successful low-level option binding. */
export interface CliOptionBindingSuccess {
  readonly status: 'bound';
  readonly values: Readonly<Record<string, unknown>>;
  readonly specified: Readonly<Record<string, boolean>>;
  readonly positionals: readonly string[];
  readonly afterDoubleDash: readonly string[];
  readonly unknownFlags: readonly CliUnknownFlag[];
}

/** Failed low-level option binding. Partial values are intentionally absent. */
export interface CliOptionBindingFailure {
  readonly status: 'invalid';
  readonly diagnostics: readonly CliDiagnostic[];
}

/** Parser-independent output from an option binder. */
export type CliOptionBindingResult = CliOptionBindingSuccess | CliOptionBindingFailure;

/** Adapter boundary between command semantics and token-level option parsing. */
export type CliOptionBinder = (input: CliOptionBindingInput) => CliOptionBindingResult;

/** Alias use retained on a successful invocation. */
export interface ParsedAlias {
  readonly token: string;
  readonly path: readonly string[];
  readonly canonicalPath: readonly string[];
  readonly deprecated?: boolean | string;
}

/** Successful command and argument binding. */
export interface ParsedInvocationSuccess {
  readonly status: 'parsed';
  readonly argv: readonly string[];
  readonly command: CliCommand;
  readonly usedAlias?: ParsedAlias;
  readonly optionValues: Readonly<Record<string, unknown>>;
  readonly specifiedOptions: Readonly<Record<string, boolean>>;
  readonly positionalValues: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly positionals: readonly string[];
  readonly afterDoubleDash: readonly string[];
  readonly unknownFlags: readonly CliUnknownFlag[];
  /** Non-fatal diagnostics, currently deprecated-alias warnings. */
  readonly diagnostics: readonly CliDiagnostic[];
}

/** Rejected invocation. Successful-looking values are intentionally absent. */
export interface ParsedInvocationFailure {
  readonly status: 'invalid';
  readonly argv: readonly string[];
  /** Deepest command reached before rejection, when command routing succeeded. */
  readonly command?: CliCommand;
  readonly diagnostics: readonly CliDiagnostic[];
}

/** Command-aware parse result discriminated by `status`. */
export type ParsedInvocation = ParsedInvocationSuccess | ParsedInvocationFailure;

/** Reusable command-aware parser. */
export interface CliInvocationParser {
  readonly parse: (program: CliProgram, input?: ParseInput) => ParsedInvocation;
}

interface CommandMatch {
  readonly command: CliCommand;
  readonly aliases: readonly AliasUse[];
  readonly commandIndexes: ReadonlySet<number>;
  readonly unknownCommand?: {
    readonly token: string;
    readonly argvIndex: number;
  };
}

interface AliasUse {
  readonly alias: CliAlias;
  readonly command: CliCommand;
  readonly token: string;
}

interface PositionalBindingSuccess {
  readonly status: 'bound';
  readonly values: Readonly<Record<string, string | readonly string[] | undefined>>;
}

interface PositionalBindingFailure {
  readonly status: 'invalid';
  readonly diagnostics: readonly CliDiagnostic[];
}

/** Creates an invocation parser around an explicit option binder. */
export function createCliInvocationParser(bindOptions: CliOptionBinder): CliInvocationParser {
  return Object.freeze({
    parse(program: CliProgram, input: ParseInput = {}): ParsedInvocation {
      return parseInvocation(program, bindOptions, input);
    }
  });
}

/** Finds the deepest command selected by an argv prefix using invocation routing rules. */
export function findCliCommandForArgv(program: CliProgram, argv: readonly string[]): CliCommand {
  return matchCommand(program, argv).command;
}

function parseInvocation(program: CliProgram, bindOptions: CliOptionBinder, input: ParseInput): ParsedInvocation {
  const argv = Object.freeze([...(input.argv ?? [])]);
  const match = matchCommand(program, argv);
  if (match.unknownCommand !== undefined) {
    return failure(argv, match.command, [createCliDiagnostic(
      'CLI_UNKNOWN_COMMAND',
      'error',
      `Unknown command: ${match.unknownCommand.token}.`,
      { token: match.unknownCommand.token, argvIndex: match.unknownCommand.argvIndex }
    )]);
  }

  const binderInput = argv.flatMap((element, argvIndex) => match.commandIndexes.has(argvIndex)
    ? []
    : [{ element, argvIndex }]);
  const binding = bindOptions({
    command: match.command,
    options: match.command.options,
    argv: Object.freeze(binderInput.map(({ element }) => element)),
    argvIndexes: Object.freeze(binderInput.map(({ argvIndex }) => argvIndex))
  });
  if (binding.status === 'invalid') return failure(argv, match.command, binding.diagnostics);

  const unknownDiagnostics = input.unknownFlagPolicy === 'collect'
    ? []
    : binding.unknownFlags.map((unknown) => createCliDiagnostic(
      'CLI_UNKNOWN_FLAG',
      'error',
      `Unknown option: ${unknown.flag}.`,
      {
        flag: unknown.flag,
        argvElement: unknown.argvElement,
        argvIndex: unknown.argvIndex,
        ...(unknown.offset === undefined ? {} : { offset: unknown.offset }),
        ...(unknown.inlineValue === undefined ? {} : { inlineValue: unknown.inlineValue })
      }
    ));
  const positionalBinding = bindPositionals(match.command, binding.positionals);
  const afterDoubleDashDiagnostics = binding.afterDoubleDash.length > 0 && !match.command.acceptsAfterDoubleDash
    ? [createCliDiagnostic(
        'CLI_AFTER_DOUBLE_DASH_NOT_ACCEPTED',
        'error',
        'This command does not accept tokens after `--`.',
        { commandPath: match.command.path }
      )]
    : [];
  const warnings = deprecatedAliasDiagnostics(match.aliases);
  if (positionalBinding.status === 'invalid') {
    return failure(argv, match.command, [
      ...warnings,
      ...unknownDiagnostics,
      ...positionalBinding.diagnostics,
      ...afterDoubleDashDiagnostics
    ]);
  }
  const otherErrors = [...unknownDiagnostics, ...afterDoubleDashDiagnostics];
  if (otherErrors.length > 0) return failure(argv, match.command, [...warnings, ...otherErrors]);

  const lastAlias = match.aliases.at(-1);
  return Object.freeze({
    status: 'parsed',
    argv,
    command: match.command,
    ...(lastAlias === undefined ? {} : { usedAlias: compileParsedAlias(lastAlias) }),
    optionValues: freezeRecord(binding.values),
    specifiedOptions: Object.freeze({ ...binding.specified }),
    positionalValues: positionalBinding.values,
    positionals: Object.freeze([...binding.positionals]),
    afterDoubleDash: Object.freeze([...binding.afterDoubleDash]),
    unknownFlags: Object.freeze(binding.unknownFlags.map(freezeUnknownFlag)),
    diagnostics: Object.freeze(warnings)
  });
}

function matchCommand(program: CliProgram, argv: readonly string[]): CommandMatch {
  let command = program.root;
  const aliases: AliasUse[] = [];
  const commandIndexes = new Set<number>();
  let argvIndex = 0;
  while (argvIndex < argv.length) {
    const token = argv[argvIndex];
    if (token === undefined || token === '--') break;
    if (token.startsWith('-')) {
      if (token === '-') break;
      argvIndex += optionSpan(command.options, argv, argvIndex);
      continue;
    }
    const children = findCliCommandChildren(program, command);
    const canonical = children.find((candidate) => candidate.name === token);
    if (canonical !== undefined) {
      command = canonical;
      commandIndexes.add(argvIndex);
      argvIndex += 1;
      continue;
    }
    const aliasMatch = children.find((candidate) => candidate.aliases.some((alias) => alias.name === token));
    if (aliasMatch !== undefined) {
      const alias = aliasMatch.aliases.find((candidate) => candidate.name === token);
      if (alias !== undefined) aliases.push({ alias, command: aliasMatch, token });
      command = aliasMatch;
      commandIndexes.add(argvIndex);
      argvIndex += 1;
      continue;
    }
    if (command.positionals.length === 0 && children.length > 0) {
      return {
        command,
        aliases: Object.freeze(aliases),
        commandIndexes,
        unknownCommand: { token, argvIndex }
      };
    }
    break;
  }
  return { command, aliases: Object.freeze(aliases), commandIndexes };
}

function optionSpan(options: readonly CliOption[], argv: readonly string[], argvIndex: number): number {
  const element = argv[argvIndex];
  if (element === undefined) return 1;
  const selection = optionSelectedByElement(options, element);
  if (selection === undefined || selection.option.valueMode !== 'required' || selection.attached) return 1;
  return argv[argvIndex + 1] === undefined || argv[argvIndex + 1] === '--' ? 1 : 2;
}

function optionSelectedByElement(
  options: readonly CliOption[],
  element: string
): { readonly option: CliOption; readonly attached: boolean } | undefined {
  if (element.startsWith('--')) {
    const equalsIndex = element.indexOf('=');
    const flag = equalsIndex < 0 ? element : element.slice(0, equalsIndex);
    const option = options.find((candidate) => candidate.flags.includes(flag));
    return option === undefined ? undefined : { option, attached: equalsIndex >= 0 };
  }
  const cluster = element.slice(1);
  for (let offset = 0; offset < cluster.length; offset += 1) {
    const option = options.find((candidate) => candidate.flags.includes(`-${cluster[offset]}`));
    if (option !== undefined && option.valueMode !== 'none') {
      return { option, attached: offset < cluster.length - 1 };
    }
  }
  return undefined;
}

function bindPositionals(command: CliCommand, positionals: readonly string[]): PositionalBindingSuccess | PositionalBindingFailure {
  const values: Record<string, string | readonly string[] | undefined> = {};
  const diagnostics: CliDiagnostic[] = [];
  let inputIndex = 0;
  for (const definition of command.positionals) {
    if (definition.variadic) {
      const rest = Object.freeze(positionals.slice(inputIndex));
      if (definition.required && rest.length === 0) {
        diagnostics.push(createCliDiagnostic(
          'CLI_MISSING_POSITIONAL',
          'error',
          `Missing required positional: ${definition.name}.`,
          { commandPath: command.path, positional: definition.name }
        ));
      }
      values[definition.name] = rest;
      inputIndex = positionals.length;
      continue;
    }
    const value = positionals[inputIndex];
    if (value === undefined) {
      if (definition.required) {
        diagnostics.push(createCliDiagnostic(
          'CLI_MISSING_POSITIONAL',
          'error',
          `Missing required positional: ${definition.name}.`,
          { commandPath: command.path, positional: definition.name }
        ));
      }
      values[definition.name] = undefined;
    } else {
      values[definition.name] = value;
      inputIndex += 1;
    }
  }
  if (inputIndex < positionals.length) {
    diagnostics.push(createCliDiagnostic(
      'CLI_UNEXPECTED_POSITIONAL',
      'error',
      'Unexpected positional input.',
      { commandPath: command.path, values: Object.freeze(positionals.slice(inputIndex)) }
    ));
  }
  if (hasErrorDiagnostics(diagnostics)) return { status: 'invalid', diagnostics: Object.freeze(diagnostics) };
  return { status: 'bound', values: Object.freeze(values) };
}

function deprecatedAliasDiagnostics(aliases: readonly AliasUse[]): readonly CliDiagnostic[] {
  return Object.freeze(aliases.flatMap(({ alias, command, token }) => alias.deprecated === undefined
    ? []
    : [createCliDiagnostic(
        'CLI_DEPRECATED_ALIAS',
        'warning',
        `Command alias ${token} is deprecated.`,
        {
          alias: token,
          aliasPath: alias.path,
          commandPath: command.path,
          ...(typeof alias.deprecated === 'string' ? { reason: alias.deprecated } : {})
        }
      )]));
}

function compileParsedAlias(use: AliasUse): ParsedAlias {
  return Object.freeze({
    token: use.token,
    path: use.alias.path,
    canonicalPath: use.command.path,
    ...(use.alias.deprecated === undefined ? {} : { deprecated: use.alias.deprecated })
  });
}

function failure(
  argv: readonly string[],
  command: CliCommand | undefined,
  diagnostics: readonly CliDiagnostic[]
): ParsedInvocationFailure {
  return Object.freeze({
    status: 'invalid',
    argv,
    ...(command === undefined ? {} : { command }),
    diagnostics: Object.freeze([...diagnostics])
  });
}

function freezeUnknownFlag(flag: CliUnknownFlag): CliUnknownFlag {
  return Object.freeze({ ...flag });
}

function freezeRecord(record: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...record });
}
