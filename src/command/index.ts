/** How a value-taking flag obtains its value. */
export type CliOptionValueMode = 'required' | 'optional-inline';

/** Scalar repetition behavior retained for integrations and presentation. */
export type CliOptionRepeat = 'error' | 'first' | 'last' | 'append' | 'count';

interface CliOptionDefinitionBase {
  /** Logical option name used in invocation values. */
  readonly name: string;
  /** Concrete flag spellings that select the option. */
  readonly flags: readonly [string, ...string[]];
  /** User-facing explanation. */
  readonly description?: string;
  /** Whether default help and completion omit the option. */
  readonly hidden?: boolean;
}

type CliDefaultMetadata =
  | {
      readonly hasDefault?: false;
      readonly defaultLabel?: never;
    }
  | {
      readonly hasDefault: true;
      readonly defaultLabel?: string;
    };

/** Parser-independent facts about a boolean option. */
export type CliBooleanOptionDefinition = CliOptionDefinitionBase & {
  readonly kind: 'boolean';
  readonly falseFlags?: readonly [string, ...string[]];
  readonly required?: boolean;
  readonly repeat?: 'error' | 'first' | 'last';
} & CliDefaultMetadata;

/** Parser-independent facts about an occurrence-counting option. */
export interface CliCountOptionDefinition extends CliOptionDefinitionBase {
  readonly kind: 'count';
}

/** Parser-independent facts about a value-taking option. */
interface CliValueOptionDefinitionBase extends CliOptionDefinitionBase {
  readonly kind: 'value';
  readonly valueLabel?: string;
  /** Human-readable constraints or meaning for the option value. */
  readonly valueDescription?: string;
  readonly required?: boolean;
  readonly multiple?: boolean;
  readonly repeat?: 'error' | 'first' | 'last';
  /** Finite raw values suitable for help and completion. */
  readonly valueCandidates?: readonly string[];
}

/** Parser-independent facts about a value-taking option. */
export type CliValueOptionDefinition = CliValueOptionDefinitionBase & CliDefaultMetadata & (
  | {
      readonly valueMode: 'required';
      readonly implicitValueLabel?: never;
    }
  | {
      readonly valueMode: 'optional-inline';
      readonly implicitValueLabel?: string;
    }
);

/** Neutral option metadata used by routing, help, completion, and validation. */
export type CliOptionDefinition =
  | CliBooleanOptionDefinition
  | CliCountOptionDefinition
  | CliValueOptionDefinition;

/** One positional input accepted by a command. */
export interface CliPositionalDefinition {
  readonly name: string;
  /** Whether absence is an error. Defaults to true. */
  readonly required?: boolean;
  /** Whether this positional consumes all remaining positional arguments. */
  readonly variadic?: boolean;
  readonly description?: string;
}

/** An alternate command token. */
export interface CliAliasDefinition {
  readonly name: string;
  readonly deprecated?: boolean | string;
}

/** Shorthand or structured alias input. */
export type CliAliasInput = string | CliAliasDefinition;

/** One command in a command definition tree. */
export interface CliCommandDefinition {
  readonly name: string;
  readonly aliases?: readonly CliAliasInput[];
  readonly description?: string;
  readonly deprecated?: boolean | string;
  readonly positionals?: readonly CliPositionalDefinition[];
  readonly options?: readonly CliOptionDefinition[];
  readonly commands?: readonly CliCommandDefinition[];
  /** Whether this command may be the final invocation target. Defaults to true. */
  readonly invokable?: boolean;
  readonly acceptsPassthroughArguments?: boolean;
}

/** A complete command tree. */
export interface CliDefinition {
  readonly name: string;
  readonly description?: string;
  /** Options available to every command. */
  readonly options?: readonly CliOptionDefinition[];
  readonly positionals?: readonly CliPositionalDefinition[];
  readonly commands?: readonly CliCommandDefinition[];
  /** Whether the root command may be the final invocation target. Defaults to true. */
  readonly invokable?: boolean;
  readonly acceptsPassthroughArguments?: boolean;
}

type OptionShape<Definition> = Definition extends { readonly kind: 'boolean' }
  ? CliBooleanOptionDefinition
  : Definition extends { readonly kind: 'count' }
    ? CliCountOptionDefinition
    : Definition extends { readonly kind: 'value' }
      ? CliValueOptionDefinition
      : never;

type ExactOption<Definition> = OptionShape<Definition> & Record<
  Exclude<keyof Definition, keyof OptionShape<Definition>>,
  never
>;

type ExactOptions<Options extends readonly CliOptionDefinition[]> = {
  readonly [Index in keyof Options]: ExactOption<Options[Index]>;
};

type ExactAliases<Aliases extends readonly CliAliasInput[]> = {
  readonly [Index in keyof Aliases]: Aliases[Index] extends string
    ? Aliases[Index]
    : Aliases[Index] extends CliAliasDefinition
      ? Aliases[Index] & Record<
          Exclude<keyof Aliases[Index], keyof CliAliasDefinition>,
          never
        >
      : never;
};

type ExactPositionals<Positionals extends readonly CliPositionalDefinition[]> = {
  readonly [Index in keyof Positionals]: Positionals[Index] & Record<
    Exclude<keyof Positionals[Index], keyof CliPositionalDefinition>,
    never
  >;
};

type ExactCommands<Commands extends readonly CliCommandDefinition[]> = {
  readonly [Index in keyof Commands]: Commands[Index] extends CliCommandDefinition
    ? ExactCommand<Commands[Index]>
    : never;
};

type ExactCommand<Command extends CliCommandDefinition> = Command & Record<
  Exclude<keyof Command, keyof CliCommandDefinition>,
  never
> & (Command extends { readonly options: infer Options }
  ? Options extends readonly CliOptionDefinition[]
    ? { readonly options: ExactOptions<Options> }
    : never
  : object) & (Command extends { readonly aliases: infer Aliases }
  ? Aliases extends readonly CliAliasInput[]
    ? { readonly aliases: ExactAliases<Aliases> }
    : never
  : object) & (Command extends { readonly positionals: infer Positionals }
  ? Positionals extends readonly CliPositionalDefinition[]
    ? { readonly positionals: ExactPositionals<Positionals> }
    : never
  : object) & (Command extends { readonly commands: infer Commands }
  ? Commands extends readonly CliCommandDefinition[]
    ? { readonly commands: ExactCommands<Commands> }
    : never
  : object);

type ExactDefinition<Definition extends CliDefinition> = Definition & Record<
  Exclude<keyof Definition, keyof CliDefinition>,
  never
> & (Definition extends { readonly options: infer Options }
  ? Options extends readonly CliOptionDefinition[]
    ? { readonly options: ExactOptions<Options> }
    : never
  : object) & (Definition extends { readonly positionals: infer Positionals }
  ? Positionals extends readonly CliPositionalDefinition[]
    ? { readonly positionals: ExactPositionals<Positionals> }
    : never
  : object) & (Definition extends { readonly commands: infer Commands }
  ? Commands extends readonly CliCommandDefinition[]
    ? { readonly commands: ExactCommands<Commands> }
    : never
  : object);

type CommandsOf<Definition> = Definition extends { readonly commands?: infer Commands }
  ? Commands extends readonly CliCommandDefinition[]
    ? Commands[number]
    : never
  : never;

type CommandKeyFor<
  ProgramName extends string,
  Command,
  Prefix extends string = ''
> = Command extends { readonly name: infer Name extends string }
  ? `${ProgramName} ${Prefix}${Name}` | CommandKeyFor<
      ProgramName,
      CommandsOf<Command>,
      `${Prefix}${Name} `
    >
  : never;

/** Canonical handler keys retained from a literal definition. */
export type CliCommandKey<Definition extends CliDefinition> =
  string extends Definition['name']
    ? string
    : Definition['name'] | CommandKeyFor<Definition['name'], CommandsOf<Definition>>;

type InvokableCommandKeyFor<
  ProgramName extends string,
  Command,
  Prefix extends string = ''
> = Command extends { readonly name: infer Name extends string }
  ? (Command extends { readonly invokable: false }
      ? never
      : `${ProgramName} ${Prefix}${Name}`) |
    InvokableCommandKeyFor<ProgramName, CommandsOf<Command>, `${Prefix}${Name} `>
  : never;

/** Canonical keys that can produce successful invocations. */
export type CliInvokableCommandKey<Definition extends CliDefinition> =
  string extends Definition['name']
    ? string
    : (Definition extends { readonly invokable: false } ? never : Definition['name']) |
      InvokableCommandKeyFor<Definition['name'], CommandsOf<Definition>>;

type CommandPathFor<
  Command,
  Prefix extends readonly string[] = readonly []
> = Command extends { readonly name: infer Name extends string }
  ? readonly [...Prefix, Name] | CommandPathFor<CommandsOf<Command>, readonly [...Prefix, Name]>
  : never;

/** Canonical command paths retained from a literal definition. */
export type CliCommandPath<Definition extends CliDefinition> =
  string extends Definition['name']
    ? readonly string[]
    : readonly [] | CommandPathFor<CommandsOf<Definition>>;

/** Why a CLI definition could not be compiled. */
export type CliDefinitionIssue =
  | {
      readonly code: 'UNKNOWN_PROPERTY';
      readonly message: string;
      readonly definitionPath: readonly string[];
      readonly property: string | symbol;
    }
  | {
      readonly code: 'INVALID_PROPERTY';
      readonly message: string;
      readonly definitionPath: readonly string[];
      readonly property: string;
      readonly expected: 'string' | 'boolean' | 'boolean-or-string';
    }
  | {
      readonly code: 'INVALID_PROGRAM_NAME';
      readonly message: string;
      readonly name: unknown;
    }
  | {
      readonly code: 'INVALID_COMMAND_NAME';
      readonly message: string;
      readonly commandPath: readonly string[];
      readonly name: unknown;
    }
  | {
      readonly code: 'DUPLICATE_COMMAND';
      readonly message: string;
      readonly commandPath: readonly string[];
    }
  | {
      readonly code: 'INVALID_ALIAS';
      readonly message: string;
      readonly commandPath: readonly string[];
      readonly alias: unknown;
    }
  | {
      readonly code: 'DUPLICATE_ALIAS';
      readonly message: string;
      readonly aliasPath: readonly string[];
    }
  | {
      readonly code: 'INVALID_POSITIONAL';
      readonly message: string;
      readonly commandPath: readonly string[];
      readonly index: number;
      readonly reason: 'definition' | 'name' | 'duplicate' | 'required-after-optional' | 'after-variadic' | 'variadic-not-last';
    }
  | {
      readonly code: 'INVALID_OPTION';
      readonly message: string;
      readonly commandPath: readonly string[];
      readonly index: number;
      readonly reason:
        | 'definition'
        | 'name'
        | 'duplicate-name'
        | 'flags'
        | 'duplicate-flag'
        | 'kind'
        | 'value-mode'
        | 'value-label'
        | 'presentation'
        | 'repeat'
        | 'candidates';
    }
  | {
      readonly code: 'AMBIGUOUS_COMMAND_INPUT';
      readonly message: string;
      readonly commandPath: readonly string[];
    }
  | {
      readonly code: 'NON_INVOKABLE_LEAF';
      readonly message: string;
      readonly commandPath: readonly string[];
    };

/** Error thrown when a command definition is malformed or ambiguous. */
export class CliDefinitionError extends TypeError {
  public readonly issues: readonly CliDefinitionIssue[];

  public constructor(issues: readonly CliDefinitionIssue[]) {
    super(`Invalid CLI definition (${String(issues.length)} ${issues.length === 1 ? 'issue' : 'issues'}).`);
    this.name = 'CliDefinitionError';
    this.issues = Object.freeze(issues.map((issue) => Object.freeze(issue)));
  }
}

/** An immutable compiled alias. */
export interface CliAlias {
  readonly name: string;
  readonly path: readonly string[];
  readonly deprecated?: boolean | string;
}

/** An immutable compiled positional. */
export interface CliPositional {
  readonly name: string;
  readonly required: boolean;
  readonly variadic: boolean;
  readonly description?: string;
}

/** Immutable parser-independent option facts. */
export interface CliOption {
  readonly name: string;
  readonly kind: 'boolean' | 'count' | 'value';
  readonly flags: readonly [string, ...string[]];
  readonly falseFlags: readonly string[];
  readonly valueMode: 'none' | CliOptionValueMode;
  readonly valueLabel?: string;
  readonly valueDescription?: string;
  readonly implicitValueLabel?: string;
  readonly required: boolean;
  readonly multiple: boolean;
  readonly repeat: CliOptionRepeat;
  readonly hasDefault: boolean;
  readonly defaultLabel?: string;
  readonly valueCandidates: readonly string[];
  readonly description?: string;
  readonly hidden: boolean;
  readonly definedAt: readonly string[];
}

/** One immutable command in a compiled program. */
export interface CliCommand<out Key extends string = string> {
  readonly key: Key;
  readonly name: string;
  readonly path: readonly string[];
  readonly parentPath?: readonly string[];
  readonly aliases: readonly CliAlias[];
  readonly description?: string;
  readonly deprecated?: boolean | string;
  readonly positionals: readonly CliPositional[];
  /** Global, ancestor, and local options visible at this command. */
  readonly options: readonly CliOption[];
  readonly invokable: boolean;
  readonly acceptsPassthroughArguments: boolean;
}

interface CliProgramRuntime {
  readonly name: string;
  readonly description?: string;
  readonly root: CliCommand;
  readonly commands: readonly CliCommand[];
  readonly commandKeys: readonly string[];
  readonly commandPaths: readonly (readonly string[])[];
}

/** A valid immutable command program retaining literal keys and paths. */
export type CliProgram<Definition extends CliDefinition = CliDefinition> =
  CliProgramRuntime & (string extends Definition['name']
    ? object
    : {
        readonly name: Definition['name'];
        readonly root: CliCommand<Definition['name']>;
        readonly commandKeys: readonly CliCommandKey<Definition>[];
        readonly commandPaths: readonly CliCommandPath<Definition>[];
      });

/** Details about a command alias lookup. */
export interface CliAliasMatch {
  readonly command: CliCommand;
  readonly alias: CliAlias;
}

interface CliCommandLookup {
  readonly byPath: ReadonlyMap<string, CliCommand>;
  readonly byAliasPath: ReadonlyMap<string, CliAliasMatch>;
  readonly childrenByPath: ReadonlyMap<string, readonly CliCommand[]>;
}

interface OptionIdentity {
  readonly name: string;
  readonly flags: readonly string[];
}

const commandLookups = new WeakMap<object, CliCommandLookup>();

const definitionProperties = new Set([
  'name',
  'description',
  'options',
  'positionals',
  'commands',
  'invokable',
  'acceptsPassthroughArguments'
]);
const commandProperties = new Set([
  'name',
  'aliases',
  'description',
  'deprecated',
  'positionals',
  'options',
  'commands',
  'invokable',
  'acceptsPassthroughArguments'
]);
const aliasProperties = new Set(['name', 'deprecated']);
const positionalProperties = new Set(['name', 'required', 'variadic', 'description']);
const optionBaseProperties = ['name', 'kind', 'flags', 'description', 'hidden'] as const;
const booleanOptionProperties = new Set([
  ...optionBaseProperties,
  'falseFlags',
  'required',
  'repeat',
  'hasDefault',
  'defaultLabel'
]);
const countOptionProperties = new Set(optionBaseProperties);
const valueOptionProperties = new Set([
  ...optionBaseProperties,
  'valueMode',
  'valueLabel',
  'valueDescription',
  'implicitValueLabel',
  'required',
  'multiple',
  'repeat',
  'hasDefault',
  'defaultLabel',
  'valueCandidates'
]);

/** Compiles a command tree or throws one structured definition error. */
export function defineCli<const Definition extends CliDefinition>(
  definition: ExactDefinition<Definition>
): CliProgram<Definition> {
  const issues = validateDefinition(definition);
  if (issues.length > 0) throw new CliDefinitionError(issues);

  const globalOptions = compileOptions(definition.options ?? [], 'global', []);
  const root = compileCommand(
    {
      name: definition.name,
      ...(definition.description === undefined ? {} : { description: definition.description }),
      ...(definition.positionals === undefined ? {} : { positionals: definition.positionals }),
      ...(definition.invokable === undefined ? {} : { invokable: definition.invokable }),
      ...(definition.acceptsPassthroughArguments === undefined
        ? {}
        : { acceptsPassthroughArguments: definition.acceptsPassthroughArguments })
    },
    [],
    undefined,
    globalOptions,
    definition.name
  );
  const commands: CliCommand[] = [root];
  compileChildren(
    definition.commands ?? [],
    [],
    globalOptions,
    definition.name,
    commands
  );
  const commandKeys = Object.freeze(commands.map((command) => command.key));
  const commandPaths = Object.freeze(commands.map((command) => command.path));
  const program = Object.freeze({
    name: definition.name,
    ...(definition.description === undefined ? {} : { description: definition.description }),
    root,
    commands: Object.freeze(commands),
    commandKeys,
    commandPaths
  }) as CliProgram<Definition>;
  commandLookups.set(program, createLookup(program));
  return program;
}

/** Looks up a command by its canonical path below the program root. */
export function findCliCommand<Definition extends CliDefinition>(
  program: CliProgram<Definition>,
  path: readonly string[]
): CliCommand | undefined {
  return lookupFor(program).byPath.get(pathKey(path));
}

/** Looks up a command by a complete alias path below the program root. */
export function findCliCommandByAlias<Definition extends CliDefinition>(
  program: CliProgram<Definition>,
  path: readonly string[]
): CliAliasMatch | undefined {
  return lookupFor(program).byAliasPath.get(pathKey(path));
}

/** Returns the direct children of a compiled command. */
export function findCliCommandChildren<Definition extends CliDefinition>(
  program: CliProgram<Definition>,
  command: CliCommand
): readonly CliCommand[] {
  return lookupFor(program).childrenByPath.get(pathKey(command.path)) ?? Object.freeze([]);
}

function validateDefinition(definition: CliDefinition): readonly CliDefinitionIssue[] {
  const issues: CliDefinitionIssue[] = [];
  if (!isRecord(definition)) {
    return Object.freeze([{
      code: 'INVALID_PROGRAM_NAME',
      message: 'The CLI definition must be an object with a valid program name.',
      name: undefined
    }]);
  }
  reportUnknownProperties(definition, definitionProperties, [], issues);
  if (!isCommandToken(definition.name)) {
    issues.push({
      code: 'INVALID_PROGRAM_NAME',
      message: 'Program name must be one non-option token.',
      name: definition.name
    });
  }
  validateOptionalString(definition, 'description', [], issues);
  validatePositionals(definition['positionals'], [], issues);
  validateBoolean(definition, 'invokable', [], issues);
  validateBoolean(definition, 'acceptsPassthroughArguments', [], issues);
  validateCommandRole(definition, [], issues);
  const globalOptions = validateOptions(definition.options, [], [], issues);
  validateCommands(definition.commands, [], globalOptions, issues);
  return Object.freeze(issues.map((issue) => Object.freeze(issue)));
}

function validateCommands(
  value: unknown,
  parentPath: readonly string[],
  inheritedOptions: readonly OptionIdentity[],
  issues: CliDefinitionIssue[]
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push({
      code: 'INVALID_COMMAND_NAME',
      message: 'Commands must be an array of command definitions.',
      commandPath: Object.freeze([...parentPath]),
      name: value
    });
    return;
  }
  const siblingTokens = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) {
      issues.push({
        code: 'INVALID_COMMAND_NAME',
        message: 'Each command must be an object.',
        commandPath: Object.freeze([...parentPath]),
        name: entry
      });
      continue;
    }
    const name = entry['name'];
    const commandPath = Object.freeze([
      ...parentPath,
      typeof name === 'string' ? name : ''
    ]);
    reportUnknownProperties(entry, commandProperties, commandPath, issues);
    if (!isCommandToken(name)) {
      issues.push({
        code: 'INVALID_COMMAND_NAME',
        message: 'Command name must be one non-option token.',
        commandPath,
        name
      });
      continue;
    }
    if (siblingTokens.has(name)) {
      issues.push({
        code: 'DUPLICATE_COMMAND',
        message: 'Sibling command names and aliases must be unique.',
        commandPath
      });
    }
    siblingTokens.add(name);
    validateOptionalString(entry, 'description', commandPath, issues);
    validateDeprecation(entry['deprecated'], commandPath, issues);
    validateAliases(entry['aliases'], commandPath, siblingTokens, issues);
    validatePositionals(entry['positionals'], commandPath, issues);
    validateBoolean(entry, 'invokable', commandPath, issues);
    validateBoolean(entry, 'acceptsPassthroughArguments', commandPath, issues);
    if (
      Array.isArray(entry['commands']) &&
      entry['commands'].length > 0 &&
      Array.isArray(entry['positionals']) &&
      entry['positionals'].length > 0
    ) {
      issues.push({
        code: 'AMBIGUOUS_COMMAND_INPUT',
        message: 'A command cannot declare both child commands and positional arguments.',
        commandPath
      });
    }
    validateCommandRole(entry, commandPath, issues);
    const localOptions = validateOptions(
      entry['options'],
      commandPath,
      inheritedOptions,
      issues
    );
    validateCommands(
      entry['commands'],
      commandPath,
      [...inheritedOptions, ...localOptions],
      issues
    );
  }
}

function validateCommandRole(
  definition: Readonly<Record<PropertyKey, unknown>>,
  commandPath: readonly string[],
  issues: CliDefinitionIssue[]
): void {
  const hasChildren = Array.isArray(definition['commands']) && definition['commands'].length > 0;
  if (definition['invokable'] === false && !hasChildren) {
    issues.push({
      code: 'NON_INVOKABLE_LEAF',
      message: 'A non-invokable command must have child commands.',
      commandPath: Object.freeze([...commandPath])
    });
  }
  if (hasChildren && Array.isArray(definition['positionals']) &&
    definition['positionals'].length > 0 && commandPath.length === 0) {
    issues.push({
      code: 'AMBIGUOUS_COMMAND_INPUT',
      message: 'The root command cannot declare both child commands and positional arguments.',
      commandPath: Object.freeze([])
    });
  }
}

function validateAliases(
  value: unknown,
  commandPath: readonly string[],
  siblingTokens: Set<string>,
  issues: CliDefinitionIssue[]
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push({
      code: 'INVALID_ALIAS',
      message: 'Aliases must be an array.',
      commandPath,
      alias: value
    });
    return;
  }
  for (const entry of value) {
    const alias = typeof entry === 'string'
      ? entry
      : isRecord(entry)
        ? entry['name']
        : undefined;
    if (isRecord(entry)) {
      reportUnknownProperties(entry, aliasProperties, [...commandPath, '<alias>'], issues);
      validateDeprecation(entry['deprecated'], commandPath, issues);
    }
    if (!isCommandToken(alias)) {
      issues.push({
        code: 'INVALID_ALIAS',
        message: 'Alias must be one non-option token.',
        commandPath,
        alias: entry
      });
      continue;
    }
    const aliasPath = Object.freeze([...commandPath.slice(0, -1), alias]);
    if (siblingTokens.has(alias)) {
      issues.push({
        code: 'DUPLICATE_ALIAS',
        message: 'Sibling command names and aliases must be unique.',
        aliasPath
      });
    }
    siblingTokens.add(alias);
  }
}

function validatePositionals(
  value: unknown,
  commandPath: readonly string[],
  issues: CliDefinitionIssue[]
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push({
      code: 'INVALID_POSITIONAL',
      message: 'Positionals must be an array.',
      commandPath,
      index: 0,
      reason: 'definition'
    });
    return;
  }
  const names = new Set<string>();
  let optionalSeen = false;
  let variadicSeen = false;
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      issues.push({
        code: 'INVALID_POSITIONAL',
        message: 'Each positional must be an object.',
        commandPath,
        index,
        reason: 'definition'
      });
      continue;
    }
    reportUnknownProperties(
      entry,
      positionalProperties,
      [...commandPath, `positionals[${String(index)}]`],
      issues
    );
    const name = entry['name'];
    if (!isLogicalName(name)) {
      issues.push({
        code: 'INVALID_POSITIONAL',
        message: 'Positional name must be a non-empty string.',
        commandPath,
        index,
        reason: 'name'
      });
    } else if (names.has(name)) {
      issues.push({
        code: 'INVALID_POSITIONAL',
        message: 'Positional names must be unique within a command.',
        commandPath,
        index,
        reason: 'duplicate'
      });
    } else {
      names.add(name);
    }
    validateOptionalString(entry, 'description', commandPath, issues);
    validateBoolean(entry, 'required', commandPath, issues);
    validateBoolean(entry, 'variadic', commandPath, issues);
    const required = entry['required'] !== false;
    const variadic = entry['variadic'] === true;
    if (variadicSeen) {
      issues.push({
        code: 'INVALID_POSITIONAL',
        message: 'Nothing may follow a variadic positional.',
        commandPath,
        index,
        reason: 'after-variadic'
      });
    }
    if (required && optionalSeen) {
      issues.push({
        code: 'INVALID_POSITIONAL',
        message: 'A required positional may not follow an optional positional.',
        commandPath,
        index,
        reason: 'required-after-optional'
      });
    }
    if (variadic && index !== value.length - 1) {
      issues.push({
        code: 'INVALID_POSITIONAL',
        message: 'A variadic positional must be last.',
        commandPath,
        index,
        reason: 'variadic-not-last'
      });
    }
    optionalSeen ||= !required;
    variadicSeen ||= variadic;
  }
}

function validateOptions(
  value: unknown,
  commandPath: readonly string[],
  inherited: readonly OptionIdentity[],
  issues: CliDefinitionIssue[]
): readonly OptionIdentity[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push({
      code: 'INVALID_OPTION',
      message: 'Options must be an array.',
      commandPath,
      index: 0,
      reason: 'definition'
    });
    return [];
  }
  const names = new Set(inherited.map((option) => option.name));
  const flags = new Set(inherited.flatMap((option) => [...option.flags]));
  const valid: OptionIdentity[] = [];
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      issues.push({
        code: 'INVALID_OPTION',
        message: 'Each option must be an object.',
        commandPath,
        index,
        reason: 'definition'
      });
      continue;
    }
    const kind = entry['kind'];
    const allowed = kind === 'boolean'
      ? booleanOptionProperties
      : kind === 'count'
        ? countOptionProperties
        : valueOptionProperties;
    reportUnknownProperties(
      entry,
      allowed,
      [...commandPath, `options[${String(index)}]`],
      issues
    );
    if (kind !== 'boolean' && kind !== 'count' && kind !== 'value') {
      issues.push({
        code: 'INVALID_OPTION',
        message: 'Option kind must be boolean, count, or value.',
        commandPath,
        index,
        reason: 'kind'
      });
    }
    const name = entry['name'];
    if (!isLogicalName(name)) {
      issues.push({
        code: 'INVALID_OPTION',
        message: 'Option name must be a non-empty string.',
        commandPath,
        index,
        reason: 'name'
      });
    } else if (names.has(name)) {
      issues.push({
        code: 'INVALID_OPTION',
        message: 'Inherited and local option names must be unique.',
        commandPath,
        index,
        reason: 'duplicate-name'
      });
    } else {
      names.add(name);
    }
    const optionFlags = readValidFlags(entry['flags']);
    const falseFlags = kind === 'boolean'
      ? readValidFlags(entry['falseFlags'], true)
      : [];
    if (optionFlags === undefined || falseFlags === undefined) {
      issues.push({
        code: 'INVALID_OPTION',
        message: 'Option flags must be non-empty strings.',
        commandPath,
        index,
        reason: 'flags'
      });
    } else {
      for (const flag of [...optionFlags, ...falseFlags]) {
        if (flags.has(flag)) {
          issues.push({
            code: 'INVALID_OPTION',
            message: 'Inherited and local flag spellings must be unique.',
            commandPath,
            index,
            reason: 'duplicate-flag'
          });
        }
        flags.add(flag);
      }
    }
    if (
      kind === 'value' &&
      entry['valueMode'] !== 'required' &&
      entry['valueMode'] !== 'optional-inline'
    ) {
      issues.push({
        code: 'INVALID_OPTION',
        message: 'Value option valueMode is invalid.',
        commandPath,
        index,
        reason: 'value-mode'
      });
    }
    if (
      entry['valueLabel'] !== undefined &&
      (kind !== 'value' || !isNonEmptyString(entry['valueLabel']))
    ) {
      issues.push({
        code: 'INVALID_OPTION',
        message: 'Only value options may have a non-empty value label.',
        commandPath,
        index,
        reason: 'value-label'
      });
    }
    if (
      entry['repeat'] !== undefined &&
      entry['repeat'] !== 'error' &&
      entry['repeat'] !== 'first' &&
      entry['repeat'] !== 'last'
    ) {
      issues.push({
        code: 'INVALID_OPTION',
        message: 'Scalar repeat must be error, first, or last.',
        commandPath,
        index,
        reason: 'repeat'
      });
    }
    if (
      entry['valueCandidates'] !== undefined &&
      !isDenseStringArray(entry['valueCandidates'])
    ) {
      issues.push({
        code: 'INVALID_OPTION',
        message: 'Value candidates must be an array of strings.',
        commandPath,
        index,
        reason: 'candidates'
      });
    }
    validateOptionalString(entry, 'description', commandPath, issues);
    validateOptionalString(entry, 'defaultLabel', commandPath, issues);
    validateOptionalString(entry, 'valueDescription', commandPath, issues);
    validateOptionalString(entry, 'implicitValueLabel', commandPath, issues);
    if (entry['defaultLabel'] !== undefined && entry['hasDefault'] !== true) {
      issues.push({
        code: 'INVALID_OPTION',
        message: 'A default label requires hasDefault to be true.',
        commandPath,
        index,
        reason: 'presentation'
      });
    }
    if (entry['implicitValueLabel'] !== undefined &&
        (kind !== 'value' || entry['valueMode'] !== 'optional-inline')) {
      issues.push({
        code: 'INVALID_OPTION',
        message: 'An implicit value label requires optional-inline value mode.',
        commandPath,
        index,
        reason: 'presentation'
      });
    }
    validateBoolean(entry, 'required', commandPath, issues);
    validateBoolean(entry, 'hidden', commandPath, issues);
    validateBoolean(entry, 'multiple', commandPath, issues);
    validateBoolean(entry, 'hasDefault', commandPath, issues);
    if (isLogicalName(name) && optionFlags !== undefined && falseFlags !== undefined) {
      valid.push({ name, flags: Object.freeze([...optionFlags, ...falseFlags]) });
    }
  }
  return valid;
}

function reportUnknownProperties(
  value: Readonly<Record<PropertyKey, unknown>>,
  allowed: ReadonlySet<string>,
  definitionPath: readonly string[],
  issues: CliDefinitionIssue[]
): void {
  for (const property of Reflect.ownKeys(value)) {
    if (typeof property === 'string' && allowed.has(property)) continue;
    issues.push({
      code: 'UNKNOWN_PROPERTY',
      message: 'Definition object contains an unsupported property.',
      definitionPath: Object.freeze([...definitionPath]),
      property
    });
  }
}

function validateOptionalString(
  value: Readonly<Record<PropertyKey, unknown>>,
  property: string,
  path: readonly string[],
  issues: CliDefinitionIssue[]
): void {
  const candidate = value[property];
  if (candidate !== undefined && typeof candidate !== 'string') {
    issues.push({
      code: 'INVALID_PROPERTY',
      message: `${property} must be a string.`,
      definitionPath: Object.freeze([...path]),
      property,
      expected: 'string'
    });
  }
}

function validateBoolean(
  value: Readonly<Record<PropertyKey, unknown>>,
  property: string,
  path: readonly string[],
  issues: CliDefinitionIssue[]
): void {
  const candidate = value[property];
  if (candidate !== undefined && typeof candidate !== 'boolean') {
    issues.push({
      code: 'INVALID_PROPERTY',
      message: `${property} must be a boolean.`,
      definitionPath: Object.freeze([...path]),
      property,
      expected: 'boolean'
    });
  }
}

function validateDeprecation(
  value: unknown,
  path: readonly string[],
  issues: CliDefinitionIssue[]
): void {
  if (value !== undefined && typeof value !== 'boolean' && typeof value !== 'string') {
    issues.push({
      code: 'INVALID_PROPERTY',
      message: 'deprecated must be a boolean or string.',
      definitionPath: Object.freeze([...path]),
      property: 'deprecated',
      expected: 'boolean-or-string'
    });
  }
}

function compileChildren(
  definitions: readonly CliCommandDefinition[],
  parentPath: readonly string[],
  inheritedOptions: readonly CliOption[],
  programName: string,
  commands: CliCommand[]
): void {
  for (const definition of definitions) {
    const path = [...parentPath, definition.name];
    const command = compileCommand(
      definition,
      path,
      parentPath,
      inheritedOptions,
      programName
    );
    commands.push(command);
    compileChildren(
      definition.commands ?? [],
      command.path,
      command.options,
      programName,
      commands
    );
  }
}

function compileCommand(
  definition: CliCommandDefinition,
  path: readonly string[],
  parentPath: readonly string[] | undefined,
  inheritedOptions: readonly CliOption[],
  programName: string
): CliCommand {
  const localOptions = compileOptions(definition.options ?? [], 'command', path);
  return Object.freeze({
    key: [programName, ...path].join(' '),
    name: definition.name,
    path: Object.freeze([...path]),
    ...(parentPath === undefined ? {} : { parentPath: Object.freeze([...parentPath]) }),
    aliases: Object.freeze(
      (definition.aliases ?? []).map((alias) => compileAlias(alias, parentPath ?? []))
    ),
    ...(definition.description === undefined ? {} : { description: definition.description }),
    ...(definition.deprecated === undefined ? {} : { deprecated: definition.deprecated }),
    positionals: Object.freeze((definition.positionals ?? []).map(compilePositional)),
    options: Object.freeze([...inheritedOptions, ...localOptions]),
    invokable: definition.invokable ?? true,
    acceptsPassthroughArguments: definition.acceptsPassthroughArguments ?? false
  });
}

function compileAlias(input: CliAliasInput, parentPath: readonly string[]): CliAlias {
  const definition = typeof input === 'string' ? { name: input } : input;
  return Object.freeze({
    name: definition.name,
    path: Object.freeze([...parentPath, definition.name]),
    ...(definition.deprecated === undefined ? {} : { deprecated: definition.deprecated })
  });
}

function compilePositional(definition: CliPositionalDefinition): CliPositional {
  return Object.freeze({
    name: definition.name,
    required: definition.required ?? true,
    variadic: definition.variadic ?? false,
    ...(definition.description === undefined ? {} : { description: definition.description })
  });
}

function compileOptions(
  definitions: readonly CliOptionDefinition[],
  scope: 'global' | 'command',
  path: readonly string[]
): readonly CliOption[] {
  return Object.freeze(definitions.map((definition) => {
    const falseFlags = definition.kind === 'boolean'
      ? Object.freeze([...(definition.falseFlags ?? [])])
      : Object.freeze([]);
    const valueCandidates = definition.kind === 'value'
      ? Object.freeze([...(definition.valueCandidates ?? [])])
      : Object.freeze([]);
    const multiple = definition.kind === 'value' && definition.multiple === true;
    const hasDefault = definition.kind === 'count'
      ? true
      : multiple || definition.hasDefault === true;
    const repeat: CliOptionRepeat = definition.kind === 'count'
      ? 'count'
      : multiple
        ? 'append'
        : definition.repeat ?? 'error';
    return Object.freeze({
      name: definition.name,
      kind: definition.kind,
      flags: freezeFlags(definition.flags),
      falseFlags,
      valueMode: definition.kind === 'value' ? definition.valueMode : 'none',
      ...(definition.kind === 'value' && definition.valueLabel !== undefined
        ? { valueLabel: definition.valueLabel }
        : {}),
      ...(definition.kind === 'value' && definition.valueDescription !== undefined
        ? { valueDescription: definition.valueDescription }
        : {}),
      ...(definition.kind === 'value' && definition.implicitValueLabel !== undefined
        ? { implicitValueLabel: definition.implicitValueLabel }
        : {}),
      required: definition.kind === 'count' ? false : definition.required ?? false,
      multiple,
      repeat,
      hasDefault,
      ...(definition.kind !== 'count' && definition.defaultLabel !== undefined
        ? { defaultLabel: definition.defaultLabel }
        : {}),
      valueCandidates,
      ...(definition.description === undefined ? {} : { description: definition.description }),
      hidden: definition.hidden ?? false,
      definedAt: scope === 'global' ? Object.freeze([]) : Object.freeze([...path])
    });
  }));
}

function createLookup(program: { readonly commands: readonly CliCommand[] }): CliCommandLookup {
  const byPath = new Map<string, CliCommand>();
  const byAliasPath = new Map<string, CliAliasMatch>();
  const mutableChildren = new Map<string, CliCommand[]>();
  for (const command of program.commands) {
    byPath.set(pathKey(command.path), command);
    for (const alias of command.aliases) {
      byAliasPath.set(pathKey(alias.path), Object.freeze({ command, alias }));
    }
    if (command.parentPath !== undefined) {
      const key = pathKey(command.parentPath);
      const children = mutableChildren.get(key) ?? [];
      children.push(command);
      mutableChildren.set(key, children);
    }
  }
  const childrenByPath = new Map<string, readonly CliCommand[]>();
  for (const [key, children] of mutableChildren) {
    childrenByPath.set(key, Object.freeze(children));
  }
  return { byPath, byAliasPath, childrenByPath };
}

function lookupFor(program: object & { readonly commands: readonly CliCommand[] }): CliCommandLookup {
  const existing = commandLookups.get(program);
  if (existing !== undefined) return existing;
  const lookup = createLookup(program);
  commandLookups.set(program, lookup);
  return lookup;
}

function pathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isCommandToken(value: unknown): value is string {
  return isNonEmptyString(value) && !value.startsWith('-') && !/\s/u.test(value) && value !== '--';
}

function isLogicalName(value: unknown): value is string {
  return isNonEmptyString(value);
}

function isFlag(value: unknown): value is string {
  return isNonEmptyString(value);
}

function readValidFlags(value: unknown, optional = false): readonly string[] | undefined {
  if (value === undefined && optional) return [];
  return isDenseArray(value) && value.length > 0 && value.every(isFlag)
    ? value
    : undefined;
}

function isDenseStringArray(value: unknown): value is readonly string[] {
  return isDenseArray(value) && value.every((entry) => typeof entry === 'string');
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function freezeFlags(flags: readonly [string, ...string[]]): readonly [string, ...string[]] {
  const [first, ...rest] = flags;
  return Object.freeze([first, ...rest]);
}
