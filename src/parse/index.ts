import {
  findCliCommand,
  findCliCommandChildren,
  type CliAlias,
  type CliCommand,
  type CliDefinition,
  type CliInvokableCommandKey,
  type CliOption,
  type CliProgram
} from '../command/index.ts';
import {
  hasErrorDiagnostics,
  type CliCoreDiagnostic,
  type CliDiagnostic,
  type CliOptionDiagnostic
} from '../diagnostics.ts';

/** Settings for one command-aware parse. */
export interface CliArgvParseInput {
  /** Tokens after the executable and program name. */
  readonly argv?: readonly string[];
  /** Whether indexed unknown flags are accepted. */
  readonly unknownFlagPolicy?: 'error' | 'collect';
}

/** Input supplied to an option binder. */
export interface CliOptionBindingInput {
  readonly command: CliCommand;
  readonly options: readonly CliOption[];
  readonly argv: readonly string[];
  /** Complete-invocation index for each element in `argv`. */
  readonly argvIndexes: readonly number[];
}

/** One non-option argument classified by a binder. */
export interface CliScannedArgument {
  readonly value: string;
  readonly argvIndex: number;
}

interface CliScannedOptionBase {
  readonly option: string;
  readonly flag: string;
  readonly argvElement: string;
  readonly argvIndex: number;
  /** UTF-16 offset for a member of a short-option cluster. */
  readonly offset?: number;
}

/** One recognized option occurrence and its complete argv ownership. */
export type CliScannedOption = CliScannedOptionBase & (
  | {
      readonly rawValue?: never;
      readonly valueArgvIndex?: never;
      readonly inline?: never;
    }
  | {
      readonly rawValue: string;
      readonly valueArgvIndex: number;
      readonly inline: boolean;
    }
);

/** One unknown option preserved at its original argv location. */
export interface CliUnknownFlag {
  readonly argvElement: string;
  readonly flag: string;
  readonly argvIndex: number;
  readonly offset?: number;
  readonly inlineValue?: string;
  readonly suggestions?: readonly string[];
}

/** Successful token classification by the option grammar owner. */
export interface CliOptionScanSuccess {
  readonly status: 'scanned';
  readonly options: readonly CliScannedOption[];
  readonly arguments: readonly CliScannedArgument[];
  readonly afterDoubleDash: readonly CliScannedArgument[];
  readonly doubleDashArgvIndex?: number;
  readonly unknownFlags: readonly CliUnknownFlag[];
}

/** Failed token classification. */
export interface CliOptionScanFailure {
  readonly status: 'invalid';
  readonly diagnostics: readonly CliOptionDiagnostic[];
  readonly unknownFlags: readonly CliUnknownFlag[];
}

/** Result of classifying argv without decoding values. */
export type CliOptionScanResult = CliOptionScanSuccess | CliOptionScanFailure;

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
  readonly diagnostics: readonly CliOptionDiagnostic[];
  readonly unknownFlags: readonly CliUnknownFlag[];
}

/** Parser-independent output from an option binder. */
export type CliOptionBindingResult = CliOptionBindingSuccess | CliOptionBindingFailure;

/** Adapter boundary implemented by the owner of token-level option grammar. */
export interface CliOptionBinder {
  readonly scan: (input: CliOptionBindingInput) => CliOptionScanResult;
  readonly bind: (input: CliOptionBindingInput) => CliOptionBindingResult;
}

/** Alias use retained on a successful invocation. */
export interface CliAliasUse {
  readonly token: string;
  readonly path: readonly string[];
  readonly canonicalPath: readonly string[];
  readonly deprecated?: boolean | string;
}

/** Origin of a validated invocation. */
export type CliInvocationSource =
  | {
      readonly kind: 'argv';
      readonly argv: readonly string[];
    }
  | {
      readonly kind: 'structured';
      readonly sourceId?: string;
    };

/** Successful command and argument binding, ready for dispatch. */
export interface CliInvocation<Command extends CliCommand = CliCommand> {
  readonly status: 'ready';
  readonly source: CliInvocationSource;
  /** Canonical key and top-level discriminant for command-specific invocation unions. */
  readonly commandKey: Command['key'];
  readonly command: Command;
  readonly usedAliases: readonly CliAliasUse[];
  readonly optionValues: Readonly<Record<string, unknown>>;
  readonly specifiedOptions: Readonly<Record<string, boolean>>;
  readonly positionalValues: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly positionals: readonly string[];
  readonly passthroughArguments: readonly string[];
  readonly unknownFlags: readonly CliUnknownFlag[];
  readonly diagnostics: readonly CliDiagnostic[];
}

/** Rejected invocation. Successful-looking values are intentionally absent. */
export interface CliInvocationFailure {
  readonly status: 'invalid';
  readonly source: CliInvocationSource;
  readonly command?: CliCommand;
  readonly diagnostics: readonly CliDiagnostic[];
  readonly unknownFlags: readonly CliUnknownFlag[];
}

type CliInvocationForKey<Key extends string> = Key extends string
  ? Omit<CliInvocation, 'commandKey' | 'command'> & {
      readonly commandKey: Key;
      readonly command: CliCommand<Key>;
    }
  : never;

type CliInvocationFor<Definition extends CliDefinition> =
  string extends Definition['name']
    ? CliInvocation
    : CliInvocationForKey<CliInvokableCommandKey<Definition>>;

/** Invocation result retaining literal keys for every invokable command. */
export type CliInvocationResult<Definition extends CliDefinition = CliDefinition> =
  | CliInvocationFor<Definition>
  | CliInvocationFailure;

/** Successful command route over binder-classified arguments. */
export interface CliCommandRouteSuccess {
  readonly status: 'routed';
  readonly command: CliCommand;
  readonly commandIndexes: readonly number[];
  readonly usedAliases: readonly CliAliasUse[];
}

/** Rejected command route. */
export interface CliCommandRouteFailure {
  readonly status: 'invalid';
  readonly command: CliCommand;
  readonly diagnostics: readonly CliDiagnostic[];
  readonly unknownFlags: readonly CliUnknownFlag[];
}

type CliCommandRouteSuccessFor<Definition extends CliDefinition> =
  string extends Definition['name']
    ? CliCommandRouteSuccess
    : CliInvokableCommandKey<Definition> extends infer Key extends string
      ? Key extends string
        ? Omit<CliCommandRouteSuccess, 'command'> & {
            readonly command: CliCommand<Key>;
          }
        : never
      : never;

/** Result of routing command tokens, retaining literal keys from its program. */
export type CliCommandRoute<Definition extends CliDefinition = CliDefinition> =
  | CliCommandRouteSuccessFor<Definition>
  | CliCommandRouteFailure;

/** Reusable command-aware parser. */
export interface CliInvocationParser {
  readonly route: <Definition extends CliDefinition>(
    program: CliProgram<Definition>,
    input?: CliArgvParseInput
  ) => CliCommandRoute<Definition>;
  readonly parse: <Definition extends CliDefinition>(
    program: CliProgram<Definition>,
    input?: CliArgvParseInput
  ) => CliInvocationResult<Definition>;
}

/** Input for creating an invocation without raw argv. */
export interface StructuredInvocationInput {
  /** Optional application-defined origin within a structured adapter. */
  readonly sourceId?: string;
  readonly commandPath?: readonly string[];
  readonly optionValues: Readonly<Record<string, unknown>>;
  readonly specifiedOptions: Readonly<Record<string, boolean>>;
  readonly positionalValues: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly passthroughArguments?: readonly string[];
}

type ExactStructuredInvocationInput<Input extends StructuredInvocationInput> = Input extends unknown
  ? Input & Record<Exclude<keyof Input, keyof StructuredInvocationInput>, never>
  : never;

type StructuredInputReadResult =
  | { readonly status: 'valid'; readonly input: StructuredInvocationInput }
  | { readonly status: 'invalid'; readonly reason: string };

interface RoutedAliasUse {
  readonly alias: CliAlias;
  readonly command: CliCommand;
  readonly token: string;
}

interface InternalRouteSuccess {
  readonly status: 'routed';
  readonly command: CliCommand;
  readonly commandIndexes: readonly number[];
  readonly aliases: readonly RoutedAliasUse[];
  readonly scan: CliOptionScanSuccess;
}

interface InternalRouteFailure {
  readonly status: 'invalid';
  readonly command: CliCommand;
  readonly diagnostics: readonly CliDiagnostic[];
  readonly unknownFlags: readonly CliUnknownFlag[];
}

type InternalRoute = InternalRouteSuccess | InternalRouteFailure;

interface PositionalBindingSuccess {
  readonly status: 'bound';
  readonly values: Readonly<Record<string, string | readonly string[] | undefined>>;
}

interface PositionalBindingFailure {
  readonly status: 'invalid';
  readonly diagnostics: readonly CliCoreDiagnostic[];
}

/** Creates an invocation parser around an explicit option grammar adapter. */
export function createCliInvocationParser(bindOptions: CliOptionBinder): CliInvocationParser {
  return Object.freeze({
    route<Definition extends CliDefinition>(
      program: CliProgram<Definition>,
      input: CliArgvParseInput = {}
    ): CliCommandRoute<Definition> {
      const argv = freezeArgv(input.argv ?? []);
      const route = routeCommand(program, bindOptions, argv);
      return (route.status === 'invalid'
        ? route
        : Object.freeze({
            status: 'routed',
            command: route.command,
            commandIndexes: route.commandIndexes,
            usedAliases: Object.freeze(route.aliases.map(compileAliasUse))
          })) as CliCommandRoute<Definition>;
    },
    parse<Definition extends CliDefinition>(
      program: CliProgram<Definition>,
      input: CliArgvParseInput = {}
    ): CliInvocationResult<Definition> {
      return parseInvocation(program, bindOptions, input);
    }
  });
}

/** Creates and validates an invocation from already-decoded application input. */
export function createCliInvocation<
  Definition extends CliDefinition,
  const Input extends StructuredInvocationInput
>(
  program: CliProgram<Definition>,
  input: ExactStructuredInvocationInput<Input>
): CliInvocationResult<Definition>;
export function createCliInvocation(
  program: CliProgram,
  candidate: unknown
): CliInvocationResult {
  const read = readStructuredInvocationInput(candidate);
  if (read.status === 'invalid') {
    return failure(
      structuredSource(),
      undefined,
      [invalidStructuredInvocationDiagnostic(read.reason)],
      []
    );
  }
  const input = read.input;
  const source = structuredSource(input.sourceId);
  const path = Object.freeze([...(input.commandPath ?? [])]);
  const command = findCliCommand(program, path);
  if (command === undefined) {
    return failure(source, undefined, [{
      source: 'command',
      code: 'CLI_UNKNOWN_COMMAND_PATH',
      severity: 'error',
      message: `Unknown command path: ${path.join(' ')}.`,
      commandPath: path
    }], []);
  }
  if (!command.invokable) {
    return failure(source, command, [subcommandRequiredDiagnostic(command)], []);
  }
  const issue = validateStructuredInput(command, input);
  if (issue !== undefined) {
    return failure(source, command, [invalidStructuredInvocationDiagnostic(issue)], []);
  }
  const passthroughArguments = Object.freeze([...(input.passthroughArguments ?? [])]);
  if (passthroughArguments.length > 0 && !command.acceptsPassthroughArguments) {
    return failure(source, command, [passthroughArgumentsDiagnostic(command)], []);
  }
  return Object.freeze({
    status: 'ready',
    source,
    commandKey: command.key,
    command,
    usedAliases: Object.freeze([]),
    optionValues: freezeRecord(input.optionValues),
    specifiedOptions: freezeBooleanRecord(input.specifiedOptions),
    positionalValues: freezePositionalRecord(input.positionalValues),
    positionals: Object.freeze(command.positionals.flatMap((positional) => {
      const value = input.positionalValues[positional.name];
      return Array.isArray(value) ? [...value] : typeof value === 'string' ? [value] : [];
    })),
    passthroughArguments,
    unknownFlags: Object.freeze([]),
    diagnostics: deprecatedCommandDiagnostics(command)
  });
}

function parseInvocation<Definition extends CliDefinition>(
  program: CliProgram<Definition>,
  binder: CliOptionBinder,
  input: CliArgvParseInput
): CliInvocationResult<Definition>;
function parseInvocation(
  program: CliProgram,
  binder: CliOptionBinder,
  input: CliArgvParseInput
): CliInvocationResult {
  const argv = freezeArgv(input.argv ?? []);
  const source = argvSource(argv);
  const route = routeCommand(program, binder, argv);
  if (route.status === 'invalid') {
    return failure(source, route.command, route.diagnostics, route.unknownFlags);
  }

  const commandIndexes = new Set(route.commandIndexes);
  const binderElements = argv.flatMap((element, argvIndex) => commandIndexes.has(argvIndex)
    ? []
    : [{ element, argvIndex }]);
  const bindingInput: CliOptionBindingInput = Object.freeze({
    command: route.command,
    options: route.command.options,
    argv: Object.freeze(binderElements.map(({ element }) => element)),
    argvIndexes: Object.freeze(binderElements.map(({ argvIndex }) => argvIndex))
  });
  const binding = binder.bind(bindingInput);
  const bindingIssue = validateBindingResult(binding, bindingInput);
  if (bindingIssue !== undefined) {
    return failure(
      source,
      route.command,
      [invalidBinderDiagnostic('bind', bindingIssue)],
      []
    );
  }
  const correspondenceIssue = validateBindingCorrespondence(
    binding,
    route.scan,
    route.commandIndexes
  );
  if (correspondenceIssue !== undefined) {
    return failure(
      source,
      route.command,
      [invalidBinderDiagnostic('bind', correspondenceIssue)],
      []
    );
  }
  if (binding.status === 'invalid') {
    return failure(source, route.command, binding.diagnostics, binding.unknownFlags);
  }

  const unknownDiagnostics = input.unknownFlagPolicy === 'collect'
    ? []
    : binding.unknownFlags.map(unknownFlagDiagnostic);
  const positionalBinding = bindPositionals(route.command, binding.positionals);
  const passthroughDiagnostics = binding.afterDoubleDash.length > 0 &&
    !route.command.acceptsPassthroughArguments
    ? [passthroughArgumentsDiagnostic(route.command)]
    : [];
  const warnings = [
    ...deprecatedAliasDiagnostics(route.aliases),
    ...deprecatedCommandDiagnostics(route.command)
  ];
  if (positionalBinding.status === 'invalid') {
    return failure(source, route.command, [
      ...warnings,
      ...unknownDiagnostics,
      ...positionalBinding.diagnostics,
      ...passthroughDiagnostics
    ], binding.unknownFlags);
  }
  const errors = [
    ...unknownDiagnostics,
    ...passthroughDiagnostics
  ];
  if (errors.length > 0) {
    return failure(source, route.command, [...warnings, ...errors], binding.unknownFlags);
  }

  return Object.freeze({
    status: 'ready',
    source,
    commandKey: route.command.key,
    command: route.command,
    usedAliases: Object.freeze(route.aliases.map(compileAliasUse)),
    optionValues: freezeRecord(binding.values),
    specifiedOptions: freezeBooleanRecord(binding.specified),
    positionalValues: positionalBinding.values,
    positionals: Object.freeze([...binding.positionals]),
    passthroughArguments: Object.freeze([...binding.afterDoubleDash]),
    unknownFlags: Object.freeze(binding.unknownFlags.map(freezeUnknownFlag)),
    diagnostics: Object.freeze(warnings)
  });
}

function routeCommand<Definition extends CliDefinition>(
  program: CliProgram<Definition>,
  binder: CliOptionBinder,
  argv: readonly string[]
): InternalRoute {
  let command = program.root;
  const aliases: RoutedAliasUse[] = [];
  const commandIndexes: number[] = [];
  let scan: CliOptionScanSuccess;
  while (true) {
    const scanInput: CliOptionBindingInput = Object.freeze({
      command,
      options: command.options,
      argv,
      argvIndexes: Object.freeze(argv.map((_element, index) => index))
    });
    const result = binder.scan(scanInput);
    const issue = validateScanResult(result, scanInput);
    if (issue !== undefined) {
      return {
        status: 'invalid',
        command,
        diagnostics: Object.freeze([invalidBinderDiagnostic('scan', issue)]),
        unknownFlags: Object.freeze([])
      };
    }
    if (result.status === 'invalid') {
      return {
        status: 'invalid',
        command,
        diagnostics: result.diagnostics,
        unknownFlags: result.unknownFlags
      };
    }
    scan = result;
    const usedIndexes = new Set(commandIndexes);
    const next = result.arguments.find((argument) => !usedIndexes.has(argument.argvIndex));
    const children = findCliCommandChildren(program, command);
    if (next === undefined) {
      if (!command.invokable) {
        return {
          status: 'invalid',
          command,
          diagnostics: Object.freeze([subcommandRequiredDiagnostic(command)]),
          unknownFlags: result.unknownFlags
        };
      }
      break;
    }
    if (children.length === 0) break;
    const precedingUnknownFlags = result.unknownFlags.filter((flag) =>
      flag.argvIndex < next.argvIndex);
    if (precedingUnknownFlags.length > 0) {
      return {
        status: 'invalid',
        command,
        diagnostics: Object.freeze(precedingUnknownFlags.map(unknownFlagDiagnostic)),
        unknownFlags: Object.freeze(precedingUnknownFlags.map(freezeUnknownFlag))
      };
    }
    const canonical = children.find((candidate) => candidate.name === next.value);
    if (canonical !== undefined) {
      command = canonical;
      commandIndexes.push(next.argvIndex);
      continue;
    }
    const aliasCommand = children.find((candidate) =>
      candidate.aliases.some((alias) => alias.name === next.value));
    if (aliasCommand !== undefined) {
      const alias = aliasCommand.aliases.find((candidate) => candidate.name === next.value);
      if (alias !== undefined) aliases.push({ alias, command: aliasCommand, token: next.value });
      command = aliasCommand;
      commandIndexes.push(next.argvIndex);
      continue;
    }
    return {
      status: 'invalid',
      command,
      diagnostics: Object.freeze([unknownCommandDiagnostic(command, next)]),
      unknownFlags: result.unknownFlags
    };
  }
  return {
    status: 'routed',
    command,
    commandIndexes: Object.freeze(commandIndexes),
    aliases: Object.freeze(aliases),
    scan
  };
}

function bindPositionals(
  command: CliCommand,
  positionals: readonly string[]
): PositionalBindingSuccess | PositionalBindingFailure {
  const values = Object.create(null) as Record<string, string | readonly string[] | undefined>;
  const diagnostics: CliCoreDiagnostic[] = [];
  let inputIndex = 0;
  for (const definition of command.positionals) {
    if (definition.variadic) {
      const rest = Object.freeze(positionals.slice(inputIndex));
      if (definition.required && rest.length === 0) {
        diagnostics.push({
          source: 'positionals',
          code: 'CLI_MISSING_POSITIONAL',
          severity: 'error',
          message: `Missing required positional: ${definition.name}.`,
          commandPath: command.path,
          positional: definition.name
        });
      }
      values[definition.name] = rest;
      inputIndex = positionals.length;
      continue;
    }
    const value = positionals[inputIndex];
    if (value === undefined) {
      if (definition.required) {
        diagnostics.push({
          source: 'positionals',
          code: 'CLI_MISSING_POSITIONAL',
          severity: 'error',
          message: `Missing required positional: ${definition.name}.`,
          commandPath: command.path,
          positional: definition.name
        });
      }
      values[definition.name] = undefined;
    } else {
      values[definition.name] = value;
      inputIndex += 1;
    }
  }
  if (inputIndex < positionals.length) {
    diagnostics.push({
      source: 'positionals',
      code: 'CLI_UNEXPECTED_POSITIONAL',
      severity: 'error',
      message: 'Unexpected positional input.',
      commandPath: command.path,
      values: Object.freeze(positionals.slice(inputIndex))
    });
  }
  if (hasErrorDiagnostics(diagnostics)) {
    return { status: 'invalid', diagnostics: Object.freeze(diagnostics) };
  }
  return { status: 'bound', values: Object.freeze(values) };
}

function validateScanResult(
  result: CliOptionScanResult,
  input: CliOptionBindingInput
): string | undefined {
  if (!isRecord(result)) return 'Scan result must be an object.';
  if (result.status === 'invalid') {
    return isDiagnosticArray(result.diagnostics) && isUnknownFlagArray(result.unknownFlags, input)
      ? undefined
      : 'Invalid scan results must contain diagnostics and indexed unknown flags.';
  }
  if (result.status !== 'scanned') return 'Scan result has an unknown status.';
  if (!isDenseArray(result.options) || !isDenseArray(result.arguments) ||
    !isDenseArray(result.afterDoubleDash) || !isUnknownFlagArray(result.unknownFlags, input)) {
    return 'Successful scan result arrays are malformed.';
  }
  const optionNames = new Set(input.options.map((option) => option.name));
  for (const occurrence of result.options) {
    if (!isRecord(occurrence) || typeof occurrence['option'] !== 'string' ||
      typeof occurrence['flag'] !== 'string' || typeof occurrence['argvElement'] !== 'string' ||
      !optionNames.has(occurrence['option']) || !isCompleteArgvIndex(occurrence['argvIndex'], input) ||
      valueAtCompleteIndex(input, occurrence['argvIndex']) !== occurrence['argvElement'] ||
      !isOptionalOffset(occurrence['offset']) ||
      !hasValidOptionMemberLocation(
        occurrence['argvElement'],
        occurrence['flag'],
        occurrence['offset']
      ) || !hasValidScannedValue(occurrence, input)) {
      return 'Scan result contains an invalid option occurrence.';
    }
    const definition = input.options.find((option) => option.name === occurrence['option']);
    if (definition === undefined ||
      ![...definition.flags, ...definition.falseFlags].includes(occurrence['flag'])) {
      return 'Scan result contains a flag not owned by its reported option.';
    }
  }
  if (!isOrderedByArgvLocation(result.options) ||
    !isOrderedByArgvLocation(result.unknownFlags)) {
    return 'Scanned option occurrences and unknown flags must be in argv order.';
  }
  for (const argument of [...result.arguments, ...result.afterDoubleDash]) {
    if (!isRecord(argument) || typeof argument['value'] !== 'string' ||
      !isCompleteArgvIndex(argument['argvIndex'], input) ||
      valueAtCompleteIndex(input, argument['argvIndex']) !== argument['value']) {
      return 'Scan result contains an invalid indexed argument.';
    }
  }
  if (!isOrderedByArgvLocation(result.arguments) ||
    !isOrderedByArgvLocation(result.afterDoubleDash)) {
    return 'Scanned arguments must be in argv order.';
  }
  if (result.doubleDashArgvIndex !== undefined &&
    (!isCompleteArgvIndex(result.doubleDashArgvIndex, input) ||
      valueAtCompleteIndex(input, result.doubleDashArgvIndex) !== '--')) {
    return 'Scan result contains an invalid double-dash index.';
  }
  const terminatorLocalIndex = input.argv.indexOf('--');
  const expectedDoubleDashIndex = terminatorLocalIndex < 0
    ? undefined
    : input.argvIndexes[terminatorLocalIndex];
  if (result.doubleDashArgvIndex !== expectedDoubleDashIndex) {
    return 'Scan result disagrees with argv about the double-dash terminator.';
  }
  if (result.doubleDashArgvIndex === undefined && result.afterDoubleDash.length > 0) {
    return 'Post-terminator arguments require a double-dash index.';
  }
  const optionMembers = new Map<number, Set<number | undefined>>();
  for (const option of result.options) {
    if (!addOptionMember(optionMembers, option.argvIndex, option.offset)) {
      return 'Scan result contains overlapping option members.';
    }
  }
  for (const flag of result.unknownFlags) {
    if (!addOptionMember(optionMembers, flag.argvIndex, flag.offset)) {
      return 'Scan result contains overlapping option members.';
    }
  }
  if (hasMemberAfterInlineValue(result.options, result.unknownFlags)) {
    return 'Scan result places an option member inside an inline value span.';
  }
  const ownership = new Map<number, string>();
  for (const index of optionMembers.keys()) ownership.set(index, 'option token');
  for (const option of result.options) {
    if (option.valueArgvIndex !== undefined && option.valueArgvIndex !== option.argvIndex &&
      !claimArgvIndex(ownership, option.valueArgvIndex, 'option value')) {
      return 'Scan result assigns one argv element to multiple owners.';
    }
  }
  for (const argument of result.arguments) {
    if (!claimArgvIndex(ownership, argument.argvIndex, 'argument')) {
      return 'Scan result assigns one argv element to multiple owners.';
    }
  }
  for (const argument of result.afterDoubleDash) {
    if (!claimArgvIndex(ownership, argument.argvIndex, 'passthrough argument')) {
      return 'Scan result assigns one argv element to multiple owners.';
    }
  }
  if (result.doubleDashArgvIndex !== undefined &&
    !claimArgvIndex(ownership, result.doubleDashArgvIndex, 'double dash')) {
    return 'Scan result assigns one argv element to multiple owners.';
  }
  if (input.argvIndexes.some((index) => !ownership.has(index))) {
    return 'Scan result leaves an argv element unclassified.';
  }
  if (result.doubleDashArgvIndex !== undefined &&
    !hasValidTerminatorPartition(result, result.doubleDashArgvIndex)) {
    return 'Scan result classifies argv elements on the wrong side of double dash.';
  }
  return undefined;
}

function hasValidScannedValue(
  occurrence: Readonly<Record<string, unknown>>,
  input: CliOptionBindingInput
): boolean {
  const hasRawValue = Object.hasOwn(occurrence, 'rawValue');
  const hasValueIndex = Object.hasOwn(occurrence, 'valueArgvIndex');
  const hasInline = Object.hasOwn(occurrence, 'inline');
  if (!hasRawValue && !hasValueIndex && !hasInline) return true;
  if (!hasRawValue || !hasValueIndex || !hasInline ||
    typeof occurrence['rawValue'] !== 'string' ||
    !isCompleteArgvIndex(occurrence['valueArgvIndex'], input) ||
    typeof occurrence['inline'] !== 'boolean') {
    return false;
  }
  const valueIndex = occurrence['valueArgvIndex'];
  const optionIndex = occurrence['argvIndex'];
  return occurrence['inline']
    ? valueIndex === optionIndex
    : valueIndex !== optionIndex &&
      valueAtCompleteIndex(input, valueIndex) === occurrence['rawValue'];
}

function hasValidOptionMemberLocation(
  argvElement: string,
  flag: string,
  offset: number | undefined
): boolean {
  return offset === undefined || (
    offset > 0 &&
    flag.length === 2 &&
    flag[0] === '-' &&
    argvElement[offset] === flag[1]
  );
}

function hasMemberAfterInlineValue(
  options: readonly CliScannedOption[],
  unknownFlags: readonly CliUnknownFlag[]
): boolean {
  const members = [...options, ...unknownFlags];
  return options.some((option) => {
    const inlineOffset = option.inline === true ? option.offset : undefined;
    return inlineOffset !== undefined &&
      members.some((member) => member.argvIndex === option.argvIndex &&
        member.offset !== undefined && member.offset > inlineOffset);
  });
}

function isOrderedByArgvLocation(
  entries: readonly { readonly argvIndex: number; readonly offset?: number }[]
): boolean {
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const current = entries[index];
    if (previous === undefined || current === undefined ||
      current.argvIndex < previous.argvIndex ||
      (current.argvIndex === previous.argvIndex &&
        (current.offset ?? -1) < (previous.offset ?? -1))) {
      return false;
    }
  }
  return true;
}

function addOptionMember(
  members: Map<number, Set<number | undefined>>,
  argvIndex: number,
  offset: number | undefined
): boolean {
  const existing = members.get(argvIndex) ?? new Set<number | undefined>();
  if (existing.has(offset) || (existing.size > 0 &&
    (offset === undefined || existing.has(undefined)))) {
    return false;
  }
  existing.add(offset);
  members.set(argvIndex, existing);
  return true;
}

function claimArgvIndex(
  ownership: Map<number, string>,
  argvIndex: number,
  owner: string
): boolean {
  if (ownership.has(argvIndex)) return false;
  ownership.set(argvIndex, owner);
  return true;
}

function hasValidTerminatorPartition(
  scan: CliOptionScanSuccess,
  doubleDashIndex: number
): boolean {
  return scan.options.every((option) => option.argvIndex < doubleDashIndex &&
    (option.valueArgvIndex === undefined || option.valueArgvIndex < doubleDashIndex)) &&
    scan.arguments.every((argument) => argument.argvIndex < doubleDashIndex) &&
    scan.unknownFlags.every((flag) => flag.argvIndex < doubleDashIndex) &&
    scan.afterDoubleDash.every((argument) => argument.argvIndex > doubleDashIndex);
}

function validateBindingCorrespondence(
  binding: CliOptionBindingResult,
  scan: CliOptionScanSuccess,
  commandIndexes: readonly number[]
): string | undefined {
  if (!sameUnknownFlags(binding.unknownFlags, scan.unknownFlags)) {
    return 'Binding and scanning disagree about unknown flags.';
  }
  if (binding.status === 'invalid') return undefined;
  const scannedOptions = new Set(scan.options.map((option) => option.option));
  for (const [name, specified] of Object.entries(binding.specified)) {
    if (specified !== scannedOptions.has(name)) {
      return 'Binding and scanning disagree about specified options.';
    }
  }
  const commands = new Set(commandIndexes);
  const expectedPositionals = scan.arguments
    .filter((argument) => !commands.has(argument.argvIndex))
    .map((argument) => argument.value);
  const expectedAfterDoubleDash = scan.afterDoubleDash.map((argument) => argument.value);
  if (!sameStrings(binding.positionals, expectedPositionals)) {
    return 'Binding and scanning disagree about positional arguments.';
  }
  if (!sameStrings(binding.afterDoubleDash, expectedAfterDoubleDash)) {
    return 'Binding and scanning disagree about post-terminator arguments.';
  }
  return undefined;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameUnknownFlags(
  left: readonly CliUnknownFlag[],
  right: readonly CliUnknownFlag[]
): boolean {
  return left.length === right.length && left.every((flag, index) => {
    const other = right[index];
    return other !== undefined && flag.argvElement === other.argvElement &&
      flag.flag === other.flag && flag.argvIndex === other.argvIndex &&
      flag.offset === other.offset && flag.inlineValue === other.inlineValue &&
      sameStrings(flag.suggestions ?? [], other.suggestions ?? []);
  });
}

function validateBindingResult(
  result: CliOptionBindingResult,
  input: CliOptionBindingInput
): string | undefined {
  if (!isRecord(result)) return 'Binding result must be an object.';
  if (result.status === 'invalid') {
    return isDiagnosticArray(result.diagnostics) && isUnknownFlagArray(result.unknownFlags, input)
      ? undefined
      : 'Invalid binding results must contain diagnostics and indexed unknown flags.';
  }
  if (result.status !== 'bound') return 'Binding result has an unknown status.';
  if (!isPlainDataRecord(result.values) || !isPlainDataRecord(result.specified) ||
    !isStringArray(result.positionals) || !isStringArray(result.afterDoubleDash) ||
    !isUnknownFlagArray(result.unknownFlags, input)) {
    return 'Successful binding result fields are malformed.';
  }
  const optionNames = new Set(input.options.map((option) => option.name));
  if (Reflect.ownKeys(result.specified).some((name) =>
    typeof name !== 'string' || !optionNames.has(name)) ||
    Reflect.ownKeys(result.values).some((name) =>
      typeof name !== 'string' || !optionNames.has(name))) {
    return 'Binding result contains an undeclared option name.';
  }
  for (const option of input.options) {
    if (!Object.hasOwn(result.specified, option.name) ||
      typeof result.specified[option.name] !== 'boolean') {
      return `Binding result must specify presence for option ${option.name}.`;
    }
    const specified = result.specified[option.name] === true;
    if (option.required && !specified) {
      return `Required option ${option.name} must be specified.`;
    }
    const hasValue = Object.hasOwn(result.values, option.name);
    const valueRequired = specified || option.hasDefault;
    if (valueRequired !== hasValue) {
      return `Binding values and presence disagree for option ${option.name}.`;
    }
  }
  return undefined;
}

function readStructuredInvocationInput(candidate: unknown): StructuredInputReadResult {
  const entries = ownDataEntries(candidate);
  if (entries === undefined) {
    return {
      status: 'invalid',
      reason: 'Input must be a plain object with data properties.'
    };
  }
  const allowedProperties = new Set([
    'sourceId',
    'commandPath',
    'optionValues',
    'specifiedOptions',
    'positionalValues',
    'passthroughArguments'
  ]);
  if (entries.some(([property]) => !allowedProperties.has(property))) {
    return { status: 'invalid', reason: 'Input contains an unsupported property.' };
  }
  const fields: Readonly<Record<string, unknown>> = Object.fromEntries(entries);
  const sourceId = fields['sourceId'];
  if (sourceId !== undefined && typeof sourceId !== 'string') {
    return { status: 'invalid', reason: 'sourceId must be a string.' };
  }
  const commandPath = fields['commandPath'] ?? [];
  if (!isStringArray(commandPath)) {
    return { status: 'invalid', reason: 'commandPath must be a dense string array.' };
  }
  const optionEntries = ownDataEntries(fields['optionValues']);
  if (optionEntries === undefined) {
    return {
      status: 'invalid',
      reason: 'optionValues must be a plain object with data properties.'
    };
  }
  const specifiedEntries = ownDataEntries(fields['specifiedOptions']);
  if (specifiedEntries === undefined || specifiedEntries.some(([, value]) =>
    typeof value !== 'boolean')) {
    return {
      status: 'invalid',
      reason: 'specifiedOptions must be a plain object of booleans with data properties.'
    };
  }
  const positionalEntries = ownDataEntries(fields['positionalValues']);
  if (positionalEntries === undefined) {
    return {
      status: 'invalid',
      reason: 'positionalValues must be a plain object with data properties.'
    };
  }
  const optionValues = Object.create(null) as Record<string, unknown>;
  for (const [name, value] of optionEntries) optionValues[name] = value;
  const specifiedOptions = Object.create(null) as Record<string, boolean>;
  for (const [name, value] of specifiedEntries) {
    if (typeof value === 'boolean') specifiedOptions[name] = value;
  }
  const positionalValues = Object.create(null) as Record<
    string,
    string | readonly string[] | undefined
  >;
  for (const [name, value] of positionalEntries) {
    if (value !== undefined && typeof value !== 'string' && !isStringArray(value)) {
      return {
        status: 'invalid',
        reason: 'positionalValues entries must be strings, string arrays, or undefined.'
      };
    }
    positionalValues[name] = isStringArray(value) ? Object.freeze([...value]) : value;
  }
  const passthroughArguments = fields['passthroughArguments'] ?? [];
  if (!isStringArray(passthroughArguments)) {
    return {
      status: 'invalid',
      reason: 'passthroughArguments must be a dense string array.'
    };
  }
  return {
    status: 'valid',
    input: Object.freeze({
      ...(typeof sourceId === 'string' ? { sourceId } : {}),
      commandPath: Object.freeze([...commandPath]),
      optionValues: Object.freeze(optionValues),
      specifiedOptions: Object.freeze(specifiedOptions),
      positionalValues: Object.freeze(positionalValues),
      passthroughArguments: Object.freeze([...passthroughArguments])
    })
  };
}

function validateStructuredInput(
  command: CliCommand,
  input: StructuredInvocationInput
): string | undefined {
  const bindingIssue = validateBindingResult({
    status: 'bound',
    values: input.optionValues,
    specified: input.specifiedOptions,
    positionals: [],
    afterDoubleDash: input.passthroughArguments ?? [],
    unknownFlags: []
  }, {
    command,
    options: command.options,
    argv: [],
    argvIndexes: []
  });
  if (bindingIssue !== undefined) return bindingIssue;
  if (!isPlainDataRecord(input.positionalValues)) {
    return 'Positional values must be a plain object with data properties.';
  }
  const positionalNames = new Set(command.positionals.map((positional) => positional.name));
  if (Reflect.ownKeys(input.positionalValues).some((name) =>
    typeof name !== 'string' || !positionalNames.has(name))) {
    return 'Structured invocation contains an undeclared positional name.';
  }
  for (const positional of command.positionals) {
    if (!Object.hasOwn(input.positionalValues, positional.name)) {
      return `Structured invocation must include positional ${positional.name}.`;
    }
    const value = input.positionalValues[positional.name];
    if (positional.variadic) {
      if (!isStringArray(value) || (positional.required && value.length === 0)) {
        return `Structured variadic positional ${positional.name} is invalid.`;
      }
    } else if (value !== undefined && typeof value !== 'string') {
      return `Structured positional ${positional.name} is invalid.`;
    } else if (positional.required && value === undefined) {
      return `Structured positional ${positional.name} is required.`;
    }
  }
  return undefined;
}

function deprecatedAliasDiagnostics(aliases: readonly RoutedAliasUse[]): readonly CliCoreDiagnostic[] {
  return Object.freeze(aliases.flatMap(({ alias, command, token }) => alias.deprecated === undefined
    ? []
    : [{
        source: 'command' as const,
        code: 'CLI_DEPRECATED_ALIAS' as const,
        severity: 'warning' as const,
        message: `Command alias ${token} is deprecated.`,
        alias: token,
        aliasPath: alias.path,
        commandPath: command.path,
        ...(typeof alias.deprecated === 'string' ? { reason: alias.deprecated } : {})
      }]));
}

function deprecatedCommandDiagnostics(command: CliCommand): readonly CliCoreDiagnostic[] {
  return command.deprecated === undefined
    ? Object.freeze([])
    : Object.freeze([{
        source: 'command',
        code: 'CLI_DEPRECATED_COMMAND',
        severity: 'warning',
        message: `Command ${command.key} is deprecated.`,
        commandPath: command.path,
        ...(typeof command.deprecated === 'string' ? { reason: command.deprecated } : {})
      }]);
}

function compileAliasUse(use: RoutedAliasUse): CliAliasUse {
  return Object.freeze({
    token: use.token,
    path: use.alias.path,
    canonicalPath: use.command.path,
    ...(use.alias.deprecated === undefined ? {} : { deprecated: use.alias.deprecated })
  });
}

function unknownCommandDiagnostic(
  command: CliCommand,
  argument: CliScannedArgument
): CliCoreDiagnostic {
  return Object.freeze({
    source: 'command',
    code: 'CLI_UNKNOWN_COMMAND',
    severity: 'error',
    message: `Unknown command: ${argument.value}.`,
    token: argument.value,
    argvIndex: argument.argvIndex,
    commandPath: command.path
  });
}

function unknownFlagDiagnostic(flag: CliUnknownFlag): CliCoreDiagnostic {
  return Object.freeze({
    source: 'invocation',
    code: 'CLI_UNKNOWN_FLAG',
    severity: 'error',
    message: `Unknown option: ${flag.flag}.`,
    flag: flag.flag,
    argvElement: flag.argvElement,
    argvIndex: flag.argvIndex,
    ...(flag.offset === undefined ? {} : { offset: flag.offset }),
    ...(flag.inlineValue === undefined ? {} : { inlineValue: flag.inlineValue }),
    ...(flag.suggestions === undefined ? {} : { suggestions: flag.suggestions })
  });
}

function subcommandRequiredDiagnostic(command: CliCommand): CliCoreDiagnostic {
  return Object.freeze({
    source: 'command',
    code: 'CLI_SUBCOMMAND_REQUIRED',
    severity: 'error',
    message: `Command ${command.key} requires a subcommand.`,
    commandPath: command.path
  });
}

function passthroughArgumentsDiagnostic(command: CliCommand): CliCoreDiagnostic {
  return Object.freeze({
    source: 'invocation',
    code: 'CLI_PASSTHROUGH_ARGUMENTS_NOT_ACCEPTED',
    severity: 'error',
    message: 'This command does not accept passthrough arguments.',
    commandPath: command.path
  });
}

function invalidBinderDiagnostic(
  stage: 'scan' | 'bind',
  reason: string
): CliCoreDiagnostic {
  return Object.freeze({
    source: 'invocation',
    code: 'CLI_INVALID_BINDER_RESULT',
    severity: 'error',
    message: `Invalid ${stage} input: ${reason}`,
    stage,
    reason
  });
}

function invalidStructuredInvocationDiagnostic(reason: string): CliCoreDiagnostic {
  return Object.freeze({
    source: 'invocation',
    code: 'CLI_INVALID_STRUCTURED_INVOCATION',
    severity: 'error',
    message: `Invalid structured invocation: ${reason}`,
    reason
  });
}

function failure(
  source: CliInvocationSource,
  command: CliCommand | undefined,
  diagnostics: readonly CliDiagnostic[],
  unknownFlags: readonly CliUnknownFlag[]
): CliInvocationFailure {
  return Object.freeze({
    status: 'invalid',
    source,
    ...(command === undefined ? {} : { command }),
    diagnostics: Object.freeze([...diagnostics]),
    unknownFlags: Object.freeze(unknownFlags.map(freezeUnknownFlag))
  });
}

function argvSource(argv: readonly string[]): CliInvocationSource {
  return Object.freeze({ kind: 'argv', argv });
}

function structuredSource(sourceId?: string): CliInvocationSource {
  return Object.freeze({
    kind: 'structured',
    ...(sourceId === undefined ? {} : { sourceId })
  });
}

function freezeArgv(argv: readonly string[]): readonly string[] {
  if (!isStringArray(argv)) throw new TypeError('argv must be a dense string array.');
  return Object.freeze([...argv]);
}

function freezeUnknownFlag(flag: CliUnknownFlag): CliUnknownFlag {
  return Object.freeze({
    ...flag,
    ...(flag.suggestions === undefined
      ? {}
      : { suggestions: Object.freeze([...flag.suggestions]) })
  });
}

function freezeRecord(record: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const copy = Object.create(null) as Record<string, unknown>;
  for (const [name, value] of Object.entries(record)) copy[name] = value;
  return Object.freeze(copy);
}

function freezeBooleanRecord(
  record: Readonly<Record<string, boolean>>
): Readonly<Record<string, boolean>> {
  const copy = Object.create(null) as Record<string, boolean>;
  for (const [name, value] of Object.entries(record)) copy[name] = value;
  return Object.freeze(copy);
}

function freezePositionalRecord(
  record: Readonly<Record<string, string | readonly string[] | undefined>>
): Readonly<Record<string, string | readonly string[] | undefined>> {
  const copy = Object.create(null) as Record<string, string | readonly string[] | undefined>;
  for (const [name, value] of Object.entries(record)) {
    copy[name] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }
  return Object.freeze(copy);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlainDataRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (!isRecord(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((property) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, property);
    return descriptor !== undefined && 'value' in descriptor;
  });
}

function ownDataEntries(
  value: unknown
): readonly (readonly [string, unknown])[] | undefined {
  if (!isPlainDataRecord(value)) return undefined;
  const entries: Array<readonly [string, unknown]> = [];
  for (const property of Reflect.ownKeys(value)) {
    if (typeof property !== 'string') return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, property);
    if (descriptor === undefined || !('value' in descriptor)) return undefined;
    entries.push([property, descriptor.value]);
  }
  return entries;
}

function isStringArray(value: unknown): value is readonly string[] {
  return isDenseArray(value) && value.every((entry) => typeof entry === 'string');
}

function isOptionalOffset(value: unknown): value is number | undefined {
  return value === undefined ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 0);
}

function isCompleteArgvIndex(value: unknown, input: CliOptionBindingInput): value is number {
  return typeof value === 'number' && Number.isInteger(value) && input.argvIndexes.includes(value);
}

function valueAtCompleteIndex(
  input: CliOptionBindingInput,
  completeIndex: number
): string | undefined {
  const localIndex = input.argvIndexes.indexOf(completeIndex);
  return localIndex < 0 ? undefined : input.argv[localIndex];
}

function isUnknownFlagArray(
  value: unknown,
  input: CliOptionBindingInput
): value is readonly CliUnknownFlag[] {
  return isDenseArray(value) && value.every((entry) => isRecord(entry) &&
    typeof entry['argvElement'] === 'string' && typeof entry['flag'] === 'string' &&
    isCompleteArgvIndex(entry['argvIndex'], input) &&
    valueAtCompleteIndex(input, entry['argvIndex']) === entry['argvElement'] &&
    isOptionalOffset(entry['offset']) &&
    hasValidOptionMemberLocation(entry['argvElement'], entry['flag'], entry['offset']) &&
    !(entry['offset'] !== undefined && entry['inlineValue'] !== undefined) &&
    (entry['inlineValue'] === undefined || typeof entry['inlineValue'] === 'string') &&
    (entry['suggestions'] === undefined || isStringArray(entry['suggestions'])));
}

function isDiagnosticArray(value: unknown): value is readonly CliOptionDiagnostic[] {
  return isDenseArray(value) && value.every((entry) => isRecord(entry) &&
    entry['source'] === 'option' && typeof entry['code'] === 'string' &&
    (entry['severity'] === 'error' || entry['severity'] === 'warning') &&
    typeof entry['message'] === 'string' && isRecord(entry['details']));
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (descriptor === undefined || !('value' in descriptor)) return false;
  }
  return true;
}
