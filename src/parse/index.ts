import { readDataArray as adoptArray, readDataRecord as adoptRecord } from '../data.ts';
import {
  findCliCommand,
  findCliCommandChildren,
  findCliCommandChild,
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

/** Command scope selected by the router for the next lexical span. */
export interface CliOptionScope {
  readonly command: CliCommand;
  readonly options: readonly CliOption[];
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
  readonly offset?: number;
}

/** An option occurrence whose source ownership is fixed by the grammar owner. */
export type CliScannedOption = CliScannedOptionBase & (
  | { readonly rawValue?: never; readonly valueArgvIndex?: never; readonly inline?: never }
  | { readonly rawValue: string; readonly valueArgvIndex: number; readonly inline: boolean }
);

export interface CliUnknownFlag {
  readonly argvElement: string;
  readonly flag: string;
  readonly argvIndex: number;
  readonly offset?: number;
  readonly inlineValue?: string;
  readonly suggestions?: readonly string[];
}

/** One contiguous classified span. Unknown syntax owns its token but blocks routing. */
export interface CliOptionScanStep {
  /** Exclusive original argv index reached by this step. */
  readonly nextIndex: number;
  readonly options: readonly CliScannedOption[];
  /** Integration-owned flag controls, excluded from the domain option namespace. */
  readonly controlOptions: readonly CliScannedOption[];
  readonly arguments: readonly CliScannedArgument[];
  /** Integration-owned control arguments; never command or positional tokens. */
  readonly controls: readonly CliScannedArgument[];
  readonly afterDoubleDash: readonly CliScannedArgument[];
  readonly unknownFlags: readonly CliUnknownFlag[];
  readonly diagnostics: readonly CliOptionDiagnostic[];
  /** Tokens that cannot be classified safely, never positional arguments. */
  readonly unclassified: readonly CliScannedArgument[];
  readonly doubleDashArgvIndex?: number;
}

/** Immutable authoritative classification retained for presentation and binding. */
export interface CliArgvClassification {
  /** Whether traversal reached the end without losing routing certainty. */
  readonly complete: boolean;
  readonly argv: readonly string[];
  readonly options: readonly CliScannedOption[];
  /** Integration-owned flag controls, excluded from the domain option namespace. */
  readonly controlOptions: readonly CliScannedOption[];
  readonly arguments: readonly CliScannedArgument[];
  /** Integration-owned control arguments; never command or positional tokens. */
  readonly controls: readonly CliScannedArgument[];
  readonly afterDoubleDash: readonly CliScannedArgument[];
  readonly unknownFlags: readonly CliUnknownFlag[];
  readonly diagnostics: readonly CliOptionDiagnostic[];
  readonly unclassified: readonly CliScannedArgument[];
  readonly doubleDashArgvIndex?: number;
}

export interface CliOptionBindingSuccess {
  readonly status: 'bound';
  readonly values: Readonly<Record<string, unknown>>;
  readonly specified: Readonly<Record<string, boolean>>;
}

export interface CliOptionBindingFailure {
  readonly status: 'invalid';
  readonly diagnostics: readonly CliOptionDiagnostic[];
}

export type CliOptionBindingResult = CliOptionBindingSuccess | CliOptionBindingFailure;

/** One invocation's grammar state. bind decodes the spans already returned by next. */
export interface CliOptionBindingSession {
  readonly next: (scope: CliOptionScope) => CliOptionScanStep;
  readonly bind: (scope: CliOptionScope) => CliOptionBindingResult;
}

/** Grammar owner creates an isolated cursor for each invocation. */
export interface CliOptionBinder {
  readonly create: (argv: readonly string[]) => CliOptionBindingSession;
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

/** A resolved route can still contain lexical errors; it is never an invocation. */
export interface CliCommandRouteSuccess {
  readonly status: 'routed';
  readonly command: CliCommand;
  readonly commandIndexes: readonly number[];
  readonly usedAliases: readonly CliAliasUse[];
  readonly classification: CliArgvClassification;
  readonly diagnostics: readonly CliDiagnostic[];
}

export interface CliCommandRouteFailure {
  readonly status: 'invalid';
  readonly command: CliCommand;
  readonly commandIndexes: readonly number[];
  readonly usedAliases: readonly CliAliasUse[];
  readonly classification: CliArgvClassification;
  readonly diagnostics: readonly CliDiagnostic[];
}

/** Result of resolving command identity without decoding option values. */
export type CliCommandRoute<Definition extends CliDefinition = CliDefinition> =
  | (Omit<CliCommandRouteSuccess, 'command'> & {
      readonly command: CliCommand<CliInvokableCommandKey<Definition>>;
    })
  | CliCommandRouteFailure;

export interface CliInvocationParser {
  readonly route: <Definition extends CliDefinition>(
    program: CliProgram<Definition>, input?: CliArgvParseInput
  ) => CliCommandRoute<Definition>;
  /** Decodes only a route owned by this parser, at most once. */
  readonly bind: <Definition extends CliDefinition>(
    route: CliCommandRoute<Definition>, input?: Pick<CliArgvParseInput, 'unknownFlagPolicy'>
  ) => CliInvocationResult<Definition>;
  readonly parse: <Definition extends CliDefinition>(
    program: CliProgram<Definition>, input?: CliArgvParseInput
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

interface PositionalBindingSuccess {
  readonly status: 'bound';
  readonly values: Readonly<Record<string, string | readonly string[] | undefined>>;
}

interface PositionalBindingFailure {
  readonly status: 'invalid';
  readonly diagnostics: readonly CliCoreDiagnostic[];
}

/** Creates a command router and decoder around an isolated grammar cursor. */
export function createCliInvocationParser(binder: CliOptionBinder): CliInvocationParser {
  const owned = new WeakMap<object, CliOptionBindingSession>();
  const results = new WeakMap<object, Map<string, CliInvocationResult>>();
  function route<Definition extends CliDefinition>(
    program: CliProgram<Definition>, input: CliArgvParseInput = {}
  ): CliCommandRoute<Definition> {
    const argv = freezeArgv(input.argv ?? []);
    const created = binder.create(argv);
    let decoded: CliOptionBindingResult | undefined;
    let decodedOnce = false;
    let decodingFailed = false;
    let decodingError: unknown;
    const session: CliOptionBindingSession = Object.freeze({
      next: (scope: CliOptionScope) => created.next(scope),
      bind: (scope: CliOptionScope) => {
        if (!decodedOnce) {
          decodedOnce = true;
          try {
            decoded = adoptBinding(created.bind(scope));
          } catch (error) {
            decodingFailed = true;
            decodingError = error;
          }
        }
        if (decodingFailed) throw decodingError;
        return decoded as CliOptionBindingResult;
      }
    });
    const result = routeCommand(program, session, argv);
    owned.set(result, session);
    return result as CliCommandRoute<Definition>;
  }
  function bind<Definition extends CliDefinition>(
    routed: CliCommandRoute<Definition>, input: Pick<CliArgvParseInput, 'unknownFlagPolicy'> = {}
  ): CliInvocationResult<Definition> {
    const session = owned.get(routed);
    if (session === undefined) throw new TypeError('Route is not owned by this invocation parser.');
    const policy = input.unknownFlagPolicy ?? 'error';
    const cached = results.get(routed);
    const previous = cached?.get(policy);
    if (previous !== undefined) return previous as CliInvocationResult<Definition>;
    // Decode once. A second policy cannot invoke a stateful decoder again.
    const result = bindRoute(routed, session, policy);
    const cache = cached ?? new Map<string, CliInvocationResult>();
    cache.set(policy, result);
    results.set(routed, cache);
    return result as CliInvocationResult<Definition>;
  }
  return Object.freeze({
    route,
    bind,
    parse<Definition extends CliDefinition>(
      program: CliProgram<Definition>, input: CliArgvParseInput = {}
    ): CliInvocationResult<Definition> {
      return bind(route(program, input), input);
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

function bindRoute(
  route: CliCommandRoute,
  session: CliOptionBindingSession,
  policy: 'error' | 'collect'
): CliInvocationResult {
  const scan = route.classification;
  const source = argvSource(scan.argv);
  if (route.status === 'invalid') {
    return failure(source, route.command, route.diagnostics, scan.unknownFlags);
  }
  const binding = session.bind(Object.freeze({ command: route.command, options: route.command.options }));
  const issue = validateBindingResult(binding, route.command.options, new Set(scan.options.map((option) => option.option)));
  if (issue !== undefined) {
    return failure(source, route.command, [invalidBinderDiagnostic('bind', issue)], scan.unknownFlags);
  }
  const warnings = [
    ...route.usedAliases.flatMap((use) => use.deprecated === undefined || use.deprecated === false
      ? [] : [Object.freeze({ source: 'command' as const, code: 'CLI_DEPRECATED_ALIAS' as const,
          severity: 'warning' as const, message: `Command alias ${use.token} is deprecated.`,
          alias: use.token, aliasPath: use.path, commandPath: use.canonicalPath,
          ...(typeof use.deprecated === 'string' ? { reason: use.deprecated } : {}) })]),
    ...deprecatedCommandDiagnostics(route.command)
  ];
  const unknownDiagnostics = policy === 'collect' ? [] : scan.unknownFlags.map(unknownFlagDiagnostic);
  if (binding.status === 'invalid') {
    return failure(source, route.command, deduplicateDiagnostics([...warnings, ...route.diagnostics, ...binding.diagnostics, ...unknownDiagnostics]), scan.unknownFlags);
  }
  const commandIndexes = new Set(route.commandIndexes);
  const positionals = Object.freeze(scan.arguments.filter((argument) =>
    !commandIndexes.has(argument.argvIndex)).map((argument) => argument.value));
  const positionalBinding = bindPositionals(route.command, positionals);
  const diagnostics: CliDiagnostic[] = [...warnings, ...route.diagnostics, ...unknownDiagnostics];
  if (positionalBinding.status === 'invalid') append(diagnostics, positionalBinding.diagnostics);
  if (scan.afterDoubleDash.length > 0 && !route.command.acceptsPassthroughArguments) {
    diagnostics.push(passthroughArgumentsDiagnostic(route.command));
  }
  if (hasErrorDiagnostics(diagnostics) || positionalBinding.status === 'invalid') {
    return failure(source, route.command, diagnostics, scan.unknownFlags);
  }
  return Object.freeze({
    status: 'ready', source, commandKey: route.command.key, command: route.command,
    usedAliases: route.usedAliases, optionValues: freezeRecord(binding.values),
    specifiedOptions: freezeBooleanRecord(binding.specified), positionalValues: positionalBinding.values,
    positionals, passthroughArguments: Object.freeze(scan.afterDoubleDash.map((argument) => argument.value)),
    unknownFlags: scan.unknownFlags, diagnostics: Object.freeze(diagnostics)
  });
}

function append<Value>(target: Value[], values: readonly Value[]): void {
  for (const value of values) target.push(value);
}

function routeCommand(
  program: CliProgram, session: CliOptionBindingSession, argv: readonly string[]
): CliCommandRoute {
  let command = program.root;
  const aliases: CliAliasUse[] = [];
  const commandIndexes: number[] = [];
  const options: CliScannedOption[] = [];
  const controlOptions: CliScannedOption[] = [];
  const args: CliScannedArgument[] = [];
  const controls: CliScannedArgument[] = [];
  const after: CliScannedArgument[] = [];
  const unknown: CliUnknownFlag[] = [];
  const unclassified: CliScannedArgument[] = [];
  const scanDiagnostics: CliOptionDiagnostic[] = [];
  const diagnostics: CliDiagnostic[] = [];
  let doubleDash: number | undefined;
  let blocked = false;
  let uncertain = false;
  let index = 0;
  while (index < argv.length && !uncertain) {
    const raw = adoptStep(session.next(Object.freeze({ command, options: command.options })));
    const children = findCliCommandChildren(program, command);
    const issue = validateScanStep(raw, argv, index, command, children.length > 0);
    if (issue !== undefined) {
      diagnostics.push(invalidBinderDiagnostic('scan', issue));
      blocked = true;
      break;
    }
    const step = snapshotStep(raw);
    append(options, step.options);
    append(controlOptions, step.controlOptions);
    append(args, step.arguments);
    append(controls, step.controls);
    append(after, step.afterDoubleDash);
    append(unknown, step.unknownFlags);
    append(unclassified, step.unclassified);
    append(scanDiagnostics, step.diagnostics);
    if (step.doubleDashArgvIndex !== undefined) doubleDash = step.doubleDashArgvIndex;
    index = step.nextIndex;
    if (step.unclassified.length > 0) {
      blocked = true;
      uncertain = true;
      continue;
    }
    // A final-token unknown cannot hide a later command or consume a suffix value.
    // All other unknown ownership remains uncertain while children are in scope.
    if (children.length > 0 && step.unknownFlags.some((flag) => flag.argvIndex < argv.length - 1)) {
      for (const flag of step.unknownFlags) diagnostics.push(unknownFlagDiagnostic(flag));
      blocked = true;
      uncertain = true;
      continue;
    }
    if (blocked) continue;
    for (const argument of step.arguments) {
      if (children.length === 0) break;
      const selected = findCliCommandChild(program, command, argument.value);
      if (selected === undefined) {
        diagnostics.push(unknownCommandDiagnostic(command, argument));
        blocked = true;
        break;
      }
      const alias = selected.aliases.find((candidate) => candidate.name === argument.value);
      if (alias !== undefined) aliases.push(compileAliasUse({ alias, command: selected, token: argument.value }));
      command = selected;
      commandIndexes.push(argument.argvIndex);
    }
  }
  if (!blocked && !command.invokable) {
    diagnostics.push(subcommandRequiredDiagnostic(command));
    blocked = true;
  }
  for (let remaining = index; remaining < argv.length; remaining += 1) {
    unclassified.push(Object.freeze({ value: argv[remaining]!, argvIndex: remaining }));
  }
  const classification: CliArgvClassification = Object.freeze({
    complete: index === argv.length && unclassified.length === 0, argv, options: Object.freeze(options), controlOptions: Object.freeze(controlOptions), arguments: Object.freeze(args), controls: Object.freeze(controls),
    afterDoubleDash: Object.freeze(after), unknownFlags: Object.freeze(unknown),
    unclassified: Object.freeze(unclassified), diagnostics: Object.freeze(scanDiagnostics),
    ...(doubleDash === undefined ? {} : { doubleDashArgvIndex: doubleDash })
  });
  return Object.freeze({
    status: blocked ? 'invalid' : 'routed', command,
    commandIndexes: Object.freeze(commandIndexes), usedAliases: Object.freeze(aliases),
    classification, diagnostics: Object.freeze([...diagnostics, ...scanDiagnostics])
  });
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

function adoptDiagnostics(value: unknown): unknown {
  return adoptArray(value)?.map((entry) => {
    const record = adoptRecord(entry);
    return record === undefined ? entry : Object.freeze({ ...record, details: adoptRecord(record['details']) });
  });
}

function adoptStep(value: unknown): CliOptionScanStep {
  const record = adoptRecord(value);
  if (record === undefined) return undefined as unknown as CliOptionScanStep;
  const output = { ...record };
  for (const field of ['options', 'controlOptions', 'arguments', 'controls', 'afterDoubleDash', 'unclassified']) {
    output[field] = adoptArray(record[field])?.map(adoptRecord);
  }
  output['unknownFlags'] = adoptArray(record['unknownFlags'])?.map((entry) => {
    const flag = adoptRecord(entry);
    return flag === undefined ? undefined : Object.freeze({ ...flag,
      ...(flag['suggestions'] === undefined ? {} : { suggestions: adoptArray(flag['suggestions']) ?? null }) });
  });
  output['diagnostics'] = adoptDiagnostics(record['diagnostics']);
  return output as unknown as CliOptionScanStep;
}

function adoptBinding(value: unknown): CliOptionBindingResult {
  const record = adoptRecord(value);
  if (record === undefined) return undefined as unknown as CliOptionBindingResult;
  return Object.freeze(record['status'] === 'invalid'
    ? { status: 'invalid', diagnostics: adoptDiagnostics(record['diagnostics']) }
    : { status: record['status'], values: adoptRecord(record['values']), specified: adoptRecord(record['specified']) }) as CliOptionBindingResult;
}

const optionScopes = new WeakMap<CliCommand, ReadonlyMap<string, string>>();
function flagsFor(command: CliCommand): ReadonlyMap<string, string> {
  const cached = optionScopes.get(command);
  if (cached !== undefined) return cached;
  const flags = new Map<string, string>();
  for (const option of command.options) {
    for (const flag of [...option.flags, ...option.falseFlags]) flags.set(flag, option.name);
  }
  optionScopes.set(command, flags);
  return flags;
}

function validateScanStep(step: CliOptionScanStep, argv: readonly string[], start: number, command: CliCommand, hasChildren: boolean): string | undefined {
  if (!isRecord(step) || !Number.isInteger(step.nextIndex) ||
    step.nextIndex <= start || step.nextIndex > argv.length) return 'Invalid cursor progress.';
  if (![step.options, step.controlOptions, step.arguments, step.controls, step.afterDoubleDash, step.unknownFlags, step.unclassified].every(Array.isArray) ||
    !isDiagnosticArray(step.diagnostics)) return 'Malformed classification fields.';
  const end = step.nextIndex;
  if (step.arguments.length + step.controls.length > 0 && (end !== start + 1 || step.arguments.length + step.controls.length !== 1)) return 'An argument step must own exactly one argv element.';
  if (step.doubleDashArgvIndex !== undefined && step.doubleDashArgvIndex !== start) return 'A terminator step must begin at its terminator.';
  const validIndex = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= start && value < end;
  const owners = new Set<number>();
  const members = new Map<number, Set<number | undefined>>();
  const claim = (index: number): boolean => { if (owners.has(index)) return false; owners.add(index); return true; };
  for (const item of [...step.options, ...step.controlOptions, ...step.unknownFlags]) {
    if (!isRecord(item) || !validIndex(item.argvIndex) || argv[item.argvIndex] !== item.argvElement ||
      typeof item.flag !== 'string' || !isOptionalOffset(item.offset)) return 'Invalid option location.';
    const existing = members.get(item.argvIndex) ?? new Set<number | undefined>();
    if (existing.has(item.offset) || (existing.size > 0 && (item.offset === undefined || existing.has(undefined)))) return 'Overlapping option members.';
    existing.add(item.offset); members.set(item.argvIndex, existing);
  }
  for (const index of members.keys()) claim(index);
  const flags = flagsFor(command);
  if (step.options.some((option) => flags.get(option.flag) !== option.option)) return 'Option is not declared in the active command scope.';
  for (const option of [...step.options, ...step.controlOptions]) {
    if (typeof option.option !== 'string') return 'Invalid option name.';
    const hasValue = Object.hasOwn(option, 'rawValue');
    if (hasValue !== Object.hasOwn(option, 'valueArgvIndex') || hasValue !== Object.hasOwn(option, 'inline')) return 'Incomplete option value ownership.';
    if (hasValue) {
      if (typeof option.rawValue !== 'string' || !validIndex(option.valueArgvIndex) || typeof option.inline !== 'boolean') return 'Invalid option value.';
      if (option.inline ? option.valueArgvIndex !== option.argvIndex :
        option.valueArgvIndex !== option.argvIndex + 1 || argv[option.valueArgvIndex] !== option.rawValue || !claim(option.valueArgvIndex)) return 'Invalid option value ownership.';
    }
  }
  for (const flag of step.unknownFlags) {
    if ((flag.inlineValue !== undefined && typeof flag.inlineValue !== 'string') ||
      (flag.suggestions !== undefined && !isStringArray(flag.suggestions))) return 'Invalid unknown flag.';
  }
  for (const argument of [...step.arguments, ...step.controls, ...step.afterDoubleDash]) {
    if (!isRecord(argument) || !validIndex(argument.argvIndex) || argv[argument.argvIndex] !== argument.value ||
      !claim(argument.argvIndex)) return 'Invalid or overlapping argument ownership.';
  }
  if (step.doubleDashArgvIndex !== undefined && (!validIndex(step.doubleDashArgvIndex) ||
    argv[step.doubleDashArgvIndex] !== '--' || !claim(step.doubleDashArgvIndex))) return 'Invalid terminator ownership.';
  if (step.afterDoubleDash.some((arg, index) => arg.argvIndex !== start + index + 1)) return 'Passthrough arguments must retain source order.';
  if (step.afterDoubleDash.length > 0 && step.doubleDashArgvIndex === undefined) return 'Passthrough requires its terminator.';
  if (step.doubleDashArgvIndex !== undefined && (end !== argv.length ||
    step.afterDoubleDash.length !== end - start - 1)) return 'Invalid terminator partition.';
  // A malformed span must not publish records beyond an ownership boundary.
  if (hasChildren && step.unknownFlags.some((flag) => flag.argvIndex < end - 1)) return 'A scan step cannot cross an unknown flag routing boundary.';
  let lastClassified = start - 1;
  for (const owned of owners) lastClassified = Math.max(lastClassified, owned);
  for (const argument of step.unclassified) {
    if (!isRecord(argument) || !validIndex(argument.argvIndex) || argv[argument.argvIndex] !== argument.value ||
      argument.argvIndex <= lastClassified || !claim(argument.argvIndex)) return 'Invalid or overlapping unclassified suffix ownership.';
  }
  if (step.unclassified.length > 0 && !hasErrorDiagnostics(step.diagnostics)) return 'Unclassified input requires an error diagnostic.';
  for (let index = start; index < end; index += 1) if (!owners.has(index)) return 'Unclassified argv element without ownership.';
  return undefined;
}

function snapshotOption(option: CliScannedOption): CliScannedOption {
  const location = {
    option: option.option, flag: option.flag, argvElement: option.argvElement, argvIndex: option.argvIndex,
    ...(option.offset === undefined ? {} : { offset: option.offset })
  };
  return Object.freeze(option.rawValue === undefined ? location : {
    ...location, rawValue: option.rawValue, valueArgvIndex: option.valueArgvIndex, inline: option.inline
  });
}

function snapshotStep(step: CliOptionScanStep): CliOptionScanStep {
  return Object.freeze({
    nextIndex: step.nextIndex,
    options: Object.freeze(step.options.map(snapshotOption)),
    controlOptions: Object.freeze(step.controlOptions.map(snapshotOption)),
    arguments: Object.freeze(step.arguments.map((arg) => Object.freeze({ value: arg.value, argvIndex: arg.argvIndex }))),
    controls: Object.freeze(step.controls.map((arg) => Object.freeze({ value: arg.value, argvIndex: arg.argvIndex }))),
    afterDoubleDash: Object.freeze(step.afterDoubleDash.map((arg) => Object.freeze({ value: arg.value, argvIndex: arg.argvIndex }))),
    unclassified: Object.freeze(step.unclassified.map((arg) => Object.freeze({ value: arg.value, argvIndex: arg.argvIndex }))),
    unknownFlags: Object.freeze(step.unknownFlags.map(freezeUnknownFlag)),
    diagnostics: Object.freeze(step.diagnostics.map((diagnostic) => Object.freeze({ source: diagnostic.source, code: diagnostic.code, severity: diagnostic.severity,
      message: diagnostic.message, details: freezeRecord(diagnostic.details) }))),
    ...(step.doubleDashArgvIndex === undefined ? {} : { doubleDashArgvIndex: step.doubleDashArgvIndex })
  });
}

function validateBindingResult(
  result: CliOptionBindingResult, options: readonly CliOption[], scannedOptions?: ReadonlySet<string>
): string | undefined {
  if (!isRecord(result)) return 'Binding result must contain data properties.';
  if (result.status === 'invalid') return isDiagnosticArray(result.diagnostics) && hasErrorDiagnostics(result.diagnostics)
    ? undefined : 'Invalid binding requires an error diagnostic.';
  if (result.status !== 'bound' || !isRecord(result.values) || !isRecord(result.specified)) return 'Malformed binding result.';
  const names = new Set(options.map((option) => option.name));
  if ([...Reflect.ownKeys(result.values), ...Reflect.ownKeys(result.specified)].some((name) => typeof name !== 'string' || !names.has(name))) return 'Binding contains an undeclared option.';
  for (const option of options) {
    if (!Object.hasOwn(result.specified, option.name) || typeof result.specified[option.name] !== 'boolean') return `Binding must specify presence for ${option.name}.`;
    const specified = result.specified[option.name] === true;
    if (scannedOptions !== undefined && specified !== scannedOptions.has(option.name)) return `Decoded presence disagrees with classification for ${option.name}.`;
    if (option.required && !specified) return `Required option ${option.name} must be specified.`;
    if (Object.hasOwn(result.values, option.name) !== (specified || option.hasDefault)) return `Values and presence disagree for ${option.name}.`;
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
  const commandPath = adoptArray(fields['commandPath'] ?? []);
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
  for (const [name, original] of positionalEntries) {
    const value = Array.isArray(original) ? adoptArray(original) : original;
    if (Array.isArray(original) && value === undefined) return { status: 'invalid', reason: 'Positional arrays must contain dense data properties.' };
    if (value !== undefined && typeof value !== 'string' && !isStringArray(value)) {
      return {
        status: 'invalid',
        reason: 'positionalValues entries must be strings, string arrays, or undefined.'
      };
    }
    positionalValues[name] = isStringArray(value) ? Object.freeze([...value]) : value;
  }
  const passthroughArguments = adoptArray(fields['passthroughArguments'] ?? []);
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
    status: 'bound', values: input.optionValues, specified: input.specifiedOptions
  }, command.options);
  if (bindingIssue !== undefined) return bindingIssue;
  if (!isRecord(input.positionalValues)) {
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

function deprecatedCommandDiagnostics(command: CliCommand): readonly CliCoreDiagnostic[] {
  return command.deprecated === undefined || command.deprecated === false
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
    message: `Unknown flag: ${flag.flag}.`,
    flag: flag.flag,
    argvElement: flag.argvElement,
    argvIndex: flag.argvIndex,
    ...(flag.offset === undefined ? {} : { offset: flag.offset }),
    ...(flag.inlineValue === undefined ? {} : { inlineValue: flag.inlineValue }),
    ...(flag.suggestions === undefined
      ? {}
      : { suggestions: Object.freeze([...flag.suggestions]) })
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

function deduplicateDiagnostics(diagnostics: readonly CliDiagnostic[]): readonly CliDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const location = diagnostic.source === 'option' ? diagnostic.details : diagnostic;
    const fields = location as Readonly<Record<string, unknown>>;
    const key = [diagnostic.source, diagnostic.code, diagnostic.message, fields['argvIndex'], fields['offset'], fields['option']]
      .map((field) => typeof field === 'string' || typeof field === 'number' ? String(field) : '').join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
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
  const adopted = adoptArray(argv);
  if (adopted === undefined || adopted.some((value) => typeof value !== 'string')) throw new TypeError('argv must be a dense string array with no custom properties.');
  return adopted as readonly string[];
}

function freezeUnknownFlag(flag: CliUnknownFlag): CliUnknownFlag {
  return Object.freeze({
    argvElement: flag.argvElement, flag: flag.flag, argvIndex: flag.argvIndex,
    ...(flag.offset === undefined ? {} : { offset: flag.offset }),
    ...(flag.inlineValue === undefined ? {} : { inlineValue: flag.inlineValue }),
    ...(flag.suggestions === undefined
      ? {}
      : { suggestions: Object.freeze([...flag.suggestions]) })
  });
}

function freezeRecord(record: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const copy = Object.create(null) as Record<string, unknown>;
  for (const [name, value] of ownDataEntries(record) ?? []) copy[name] = value;
  return Object.freeze(copy);
}

function freezeBooleanRecord(
  record: Readonly<Record<string, boolean>>
): Readonly<Record<string, boolean>> {
  const copy = Object.create(null) as Record<string, boolean>;
  for (const [name, value] of ownDataEntries(record) ?? []) if (typeof value === 'boolean') copy[name] = value;
  return Object.freeze(copy);
}

function freezePositionalRecord(
  record: Readonly<Record<string, string | readonly string[] | undefined>>
): Readonly<Record<string, string | readonly string[] | undefined>> {
  const copy = Object.create(null) as Record<string, string | readonly string[] | undefined>;
  for (const [name, value] of ownDataEntries(record) ?? []) {
    if (value === undefined || typeof value === 'string' || isStringArray(value)) {
      copy[name] = Array.isArray(value) ? Object.freeze([...value]) : value;
    }
  }
  return Object.freeze(copy);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ownDataEntries(value: unknown): readonly (readonly [string, unknown])[] | undefined {
  const record = adoptRecord(value);
  return record === undefined ? undefined : Object.entries(record);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isOptionalOffset(value: unknown): value is number | undefined {
  return value === undefined ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 0);
}

function isDiagnosticArray(value: unknown): value is readonly CliOptionDiagnostic[] {
  return Array.isArray(value) && value.every((entry) => isRecord(entry) &&
    entry['source'] === 'option' && typeof entry['code'] === 'string' &&
    (entry['severity'] === 'error' || entry['severity'] === 'warning') &&
    typeof entry['message'] === 'string' && isRecord(entry['details']));
}
