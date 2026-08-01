/** How a displayed option accepts a value. */
export type CliOptionValueMode = 'none' | 'required' | 'optional-inline';

/** A flag that does not accept a value. */
export interface CliSwitchOptionDefinition {
  /** Logical option name used in parsed values. */
  readonly name: string;
  /** Accepted flag spellings. */
  readonly flags: readonly [string, ...string[]];
  /** This option does not accept a value. */
  readonly valueMode: 'none';
  /** A value label is meaningless for a switch. */
  readonly valueLabel?: never;
  /** Whether the option must occur. */
  readonly required?: boolean;
  /** User-facing explanation. */
  readonly description?: string;
  /** Whether default help and completion omit the option. */
  readonly hidden?: boolean;
}

/** A flag that accepts a required or optional-inline value. */
export interface CliValueOptionDefinition {
  /** Logical option name used in parsed values. */
  readonly name: string;
  /** Accepted flag spellings. */
  readonly flags: readonly [string, ...string[]];
  /** How the flag obtains its value. */
  readonly valueMode: 'required' | 'optional-inline';
  /** Label used for the value in help output. */
  readonly valueLabel?: string;
  /** Whether the option must occur. */
  readonly required?: boolean;
  /** User-facing explanation. */
  readonly description?: string;
  /** Whether default help and completion omit the option. */
  readonly hidden?: boolean;
}

/** Parser-independent option metadata used by routing, help, and completion. */
export type CliOptionDefinition = CliSwitchOptionDefinition | CliValueOptionDefinition;

/** One positional input accepted by a command. */
export interface CliPositionalDefinition {
  /** Logical positional name. */
  readonly name: string;
  /** Whether absence is an error. Defaults to true. */
  readonly required?: boolean;
  /** Whether this positional consumes all remaining positional tokens. */
  readonly variadic?: boolean;
  /** User-facing explanation. */
  readonly description?: string;
}

/** An alternate command token. */
export interface CliAliasDefinition {
  /** Alias token relative to the command parent. */
  readonly name: string;
  /** Optional deprecation explanation. */
  readonly deprecated?: boolean | string;
}

/** Shorthand or structured alias input. */
export type CliAliasInput = string | CliAliasDefinition;

/** One command in a command definition tree. */
export interface CliCommandDefinition {
  /** Command token relative to its parent. */
  readonly name: string;
  /** Alternate tokens relative to its parent. */
  readonly aliases?: readonly CliAliasInput[];
  /** User-facing explanation. */
  readonly description?: string;
  /** Optional command deprecation explanation. */
  readonly deprecated?: boolean | string;
  /** Local positional definitions. */
  readonly positionals?: readonly CliPositionalDefinition[];
  /** Local option metadata. */
  readonly options?: readonly CliOptionDefinition[];
  /** Nested commands. */
  readonly commands?: readonly CliCommandDefinition[];
  /** Whether tokens after `--` are accepted by this command. */
  readonly acceptsAfterDoubleDash?: boolean;
}

/** A complete command tree. */
export interface CliDefinition {
  /** Program token used in help and command keys. */
  readonly name: string;
  /** User-facing program explanation. */
  readonly description?: string;
  /** Options available to every command. */
  readonly options?: readonly CliOptionDefinition[];
  /** Top-level commands. */
  readonly commands?: readonly CliCommandDefinition[];
}

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
      readonly reason: 'definition' | 'name' | 'duplicate-name' | 'flags' | 'duplicate-flag' | 'value-mode' | 'value-label';
    };

/** Error thrown when a command definition is malformed or ambiguous. */
export class CliDefinitionError extends TypeError {
  /** Every issue found in the rejected definition. */
  public readonly issues: readonly CliDefinitionIssue[];

  public constructor(issues: readonly CliDefinitionIssue[]) {
    super(`Invalid CLI definition (${String(issues.length)} ${issues.length === 1 ? 'issue' : 'issues'}).`);
    this.name = 'CliDefinitionError';
    this.issues = Object.freeze([...issues]);
  }
}

/** An immutable compiled alias. */
export interface CliAlias {
  /** Alias token relative to the command parent. */
  readonly name: string;
  /** Complete alias path. */
  readonly path: readonly string[];
  /** Optional deprecation explanation. */
  readonly deprecated?: boolean | string;
}

/** An immutable compiled positional. */
export interface CliPositional {
  readonly name: string;
  readonly required: boolean;
  readonly variadic: boolean;
  readonly description?: string;
}

/** An immutable compiled option presentation. */
export interface CliOption {
  readonly name: string;
  readonly flags: readonly [string, ...string[]];
  readonly valueMode: CliOptionValueMode;
  readonly valueLabel?: string;
  readonly required: boolean;
  readonly description?: string;
  readonly hidden: boolean;
  readonly scope: 'global' | 'local';
}

/** One immutable command in a compiled program. */
export interface CliCommand {
  /** Unambiguous key containing the program name and canonical command path. */
  readonly key: string;
  readonly name: string;
  /** Canonical path below the program root. */
  readonly path: readonly string[];
  readonly parentPath?: readonly string[];
  readonly aliases: readonly CliAlias[];
  readonly description?: string;
  readonly deprecated?: boolean | string;
  readonly positionals: readonly CliPositional[];
  /** Global and local options visible at this command. */
  readonly options: readonly CliOption[];
  readonly acceptsAfterDoubleDash: boolean;
}

/** A valid immutable command program. */
export interface CliProgram {
  readonly name: string;
  readonly description?: string;
  readonly root: CliCommand;
  readonly commands: readonly CliCommand[];
}

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

const commandLookups = new WeakMap<CliProgram, CliCommandLookup>();

const definitionProperties = new Set(['name', 'description', 'options', 'commands']);
const commandProperties = new Set([
  'name',
  'aliases',
  'description',
  'deprecated',
  'positionals',
  'options',
  'commands',
  'acceptsAfterDoubleDash'
]);
const aliasProperties = new Set(['name', 'deprecated']);
const positionalProperties = new Set(['name', 'required', 'variadic', 'description']);
const optionProperties = new Set(['name', 'flags', 'valueMode', 'valueLabel', 'required', 'description', 'hidden']);

/** Compiles a command tree or throws a structured definition error. */
export function defineCli(definition: CliDefinition): CliProgram {
  const issues = validateDefinition(definition);
  if (issues.length > 0) throw new CliDefinitionError(issues);

  const globalOptions = compileOptions(definition.options ?? [], 'global');
  const root = compileCommand(
    {
      name: definition.name,
      ...(definition.description === undefined ? {} : { description: definition.description })
    },
    [],
    undefined,
    globalOptions,
    definition.name
  );
  const commands: CliCommand[] = [root];
  compileChildren(definition.commands ?? [], [], globalOptions, definition.name, commands);
  const program = Object.freeze({
    name: definition.name,
    ...(definition.description === undefined ? {} : { description: definition.description }),
    root,
    commands: Object.freeze(commands)
  });
  commandLookups.set(program, createLookup(program));
  return program;
}

/** Looks up a command by its canonical path below the program root. */
export function findCliCommand(program: CliProgram, path: readonly string[]): CliCommand | undefined {
  return lookupFor(program).byPath.get(pathKey(path));
}

/** Looks up a command by a complete alias path below the program root. */
export function findCliCommandByAlias(program: CliProgram, path: readonly string[]): CliAliasMatch | undefined {
  return lookupFor(program).byAliasPath.get(pathKey(path));
}

/** Returns the direct children of a compiled command. */
export function findCliCommandChildren(program: CliProgram, command: CliCommand): readonly CliCommand[] {
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
    issues.push({ code: 'INVALID_PROGRAM_NAME', message: 'Program name must be one non-option token.', name: definition.name });
  }
  validateOptionalString(definition, 'description', [], issues);
  const globalOptions = validateOptions(definition.options, [], [], issues);
  validateCommands(definition.commands, [], globalOptions, issues);
  return Object.freeze(issues.map(freezeIssue));
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
    const commandPath = Object.freeze([...parentPath, typeof name === 'string' ? name : '']);
    reportUnknownProperties(entry, commandProperties, commandPath, issues);
    if (!isCommandToken(name)) {
      issues.push({ code: 'INVALID_COMMAND_NAME', message: 'Command name must be one non-option token.', commandPath, name });
      continue;
    }
    if (siblingTokens.has(name)) {
      issues.push({ code: 'DUPLICATE_COMMAND', message: 'Sibling command names and aliases must be unique.', commandPath });
    }
    siblingTokens.add(name);
    validateOptionalString(entry, 'description', commandPath, issues);
    validateDeprecation(entry['deprecated'], commandPath, issues);
    validateAliases(entry['aliases'], commandPath, siblingTokens, issues);
    validatePositionals(entry['positionals'], commandPath, issues);
    validateBoolean(entry, 'acceptsAfterDoubleDash', commandPath, issues);
    validateOptions(entry['options'], commandPath, inheritedOptions, issues);
    validateCommands(entry['commands'], commandPath, inheritedOptions, issues);
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
    issues.push({ code: 'INVALID_ALIAS', message: 'Aliases must be an array.', commandPath, alias: value });
    return;
  }
  for (const entry of value) {
    const alias = typeof entry === 'string' ? entry : isRecord(entry) ? entry['name'] : undefined;
    if (isRecord(entry)) {
      reportUnknownProperties(entry, aliasProperties, [...commandPath, '<alias>'], issues);
      validateDeprecation(entry['deprecated'], commandPath, issues);
    }
    if (!isCommandToken(alias)) {
      issues.push({ code: 'INVALID_ALIAS', message: 'Alias must be one non-option token.', commandPath, alias: entry });
      continue;
    }
    const aliasPath = Object.freeze([...commandPath.slice(0, -1), alias]);
    if (siblingTokens.has(alias)) {
      issues.push({ code: 'DUPLICATE_ALIAS', message: 'Sibling command names and aliases must be unique.', aliasPath });
    }
    siblingTokens.add(alias);
  }
}

function validatePositionals(value: unknown, commandPath: readonly string[], issues: CliDefinitionIssue[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push({ code: 'INVALID_POSITIONAL', message: 'Positionals must be an array.', commandPath, index: 0, reason: 'definition' });
    return;
  }
  const names = new Set<string>();
  let optionalSeen = false;
  let variadicSeen = false;
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      issues.push({ code: 'INVALID_POSITIONAL', message: 'Each positional must be an object.', commandPath, index, reason: 'definition' });
      continue;
    }
    reportUnknownProperties(entry, positionalProperties, [...commandPath, `positionals[${String(index)}]`], issues);
    const name = entry['name'];
    if (!isIdentifier(name)) {
      issues.push({ code: 'INVALID_POSITIONAL', message: 'Positional name must be a non-empty identifier.', commandPath, index, reason: 'name' });
    } else if (names.has(name)) {
      issues.push({ code: 'INVALID_POSITIONAL', message: 'Positional names must be unique within a command.', commandPath, index, reason: 'duplicate' });
    } else {
      names.add(name);
    }
    validateOptionalString(entry, 'description', commandPath, issues);
    validateBoolean(entry, 'required', commandPath, issues);
    validateBoolean(entry, 'variadic', commandPath, issues);
    const required = entry['required'] !== false;
    const variadic = entry['variadic'] === true;
    if (variadicSeen) {
      issues.push({ code: 'INVALID_POSITIONAL', message: 'Nothing may follow a variadic positional.', commandPath, index, reason: 'after-variadic' });
    }
    if (required && optionalSeen) {
      issues.push({ code: 'INVALID_POSITIONAL', message: 'A required positional may not follow an optional positional.', commandPath, index, reason: 'required-after-optional' });
    }
    if (variadic && index !== value.length - 1) {
      issues.push({ code: 'INVALID_POSITIONAL', message: 'A variadic positional must be last.', commandPath, index, reason: 'variadic-not-last' });
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
    issues.push({ code: 'INVALID_OPTION', message: 'Options must be an array.', commandPath, index: 0, reason: 'definition' });
    return [];
  }
  const names = new Set(inherited.map((option) => option.name));
  const flags = new Set(inherited.flatMap((option) => [...option.flags]));
  const valid: OptionIdentity[] = [];
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      issues.push({ code: 'INVALID_OPTION', message: 'Each option must be an object.', commandPath, index, reason: 'definition' });
      continue;
    }
    reportUnknownProperties(entry, optionProperties, [...commandPath, `options[${String(index)}]`], issues);
    const name = entry['name'];
    if (!isIdentifier(name)) {
      issues.push({ code: 'INVALID_OPTION', message: 'Option name must be a non-empty identifier.', commandPath, index, reason: 'name' });
    } else if (names.has(name)) {
      issues.push({ code: 'INVALID_OPTION', message: 'Visible option names must be unique.', commandPath, index, reason: 'duplicate-name' });
    } else {
      names.add(name);
    }
    const optionFlags = entry['flags'];
    if (!Array.isArray(optionFlags) || optionFlags.length === 0 || optionFlags.some((flag) => !isFlag(flag))) {
      issues.push({ code: 'INVALID_OPTION', message: 'Option flags must be a non-empty array of flag spellings.', commandPath, index, reason: 'flags' });
    } else {
      for (const flag of optionFlags) {
        if (flags.has(flag as string)) {
          issues.push({ code: 'INVALID_OPTION', message: 'Visible flag spellings must be unique.', commandPath, index, reason: 'duplicate-flag' });
        }
        flags.add(flag as string);
      }
    }
    const valueMode = entry['valueMode'];
    if (valueMode !== 'none' && valueMode !== 'required' && valueMode !== 'optional-inline') {
      issues.push({ code: 'INVALID_OPTION', message: 'Option valueMode is invalid.', commandPath, index, reason: 'value-mode' });
    }
    if ((valueMode === 'none' && entry['valueLabel'] !== undefined)
      || (entry['valueLabel'] !== undefined && !isNonEmptyString(entry['valueLabel']))) {
      issues.push({ code: 'INVALID_OPTION', message: 'Only value-taking options may have a non-empty value label.', commandPath, index, reason: 'value-label' });
    }
    validateOptionalString(entry, 'description', commandPath, issues);
    validateBoolean(entry, 'required', commandPath, issues);
    validateBoolean(entry, 'hidden', commandPath, issues);
    if (isIdentifier(name) && Array.isArray(optionFlags) && optionFlags.length > 0 && optionFlags.every(isFlag)) {
      valid.push({ name, flags: Object.freeze([...optionFlags]) });
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

function validateDeprecation(value: unknown, path: readonly string[], issues: CliDefinitionIssue[]): void {
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
  globalOptions: readonly CliOption[],
  programName: string,
  commands: CliCommand[]
): void {
  for (const definition of definitions) {
    const command = compileCommand(definition, [...parentPath, definition.name], parentPath, globalOptions, programName);
    commands.push(command);
    compileChildren(definition.commands ?? [], command.path, globalOptions, programName, commands);
  }
}

function compileCommand(
  definition: CliCommandDefinition,
  path: readonly string[],
  parentPath: readonly string[] | undefined,
  globalOptions: readonly CliOption[],
  programName: string
): CliCommand {
  const localOptions = compileOptions(definition.options ?? [], 'local');
  return Object.freeze({
    key: [programName, ...path].join(' '),
    name: definition.name,
    path: Object.freeze([...path]),
    ...(parentPath === undefined ? {} : { parentPath: Object.freeze([...parentPath]) }),
    aliases: Object.freeze((definition.aliases ?? []).map((alias) => compileAlias(alias, parentPath ?? []))),
    ...(definition.description === undefined ? {} : { description: definition.description }),
    ...(definition.deprecated === undefined ? {} : { deprecated: definition.deprecated }),
    positionals: Object.freeze((definition.positionals ?? []).map(compilePositional)),
    options: Object.freeze([...globalOptions, ...localOptions]),
    acceptsAfterDoubleDash: definition.acceptsAfterDoubleDash ?? false
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

function compileOptions(definitions: readonly CliOptionDefinition[], scope: 'global' | 'local'): readonly CliOption[] {
  return Object.freeze(definitions.map((definition) => Object.freeze({
    name: definition.name,
    flags: freezeFlags(definition.flags),
    valueMode: definition.valueMode,
    ...(definition.valueLabel === undefined ? {} : { valueLabel: definition.valueLabel }),
    required: definition.required ?? false,
    ...(definition.description === undefined ? {} : { description: definition.description }),
    hidden: definition.hidden ?? false,
    scope
  })));
}

function createLookup(program: CliProgram): CliCommandLookup {
  const byPath = new Map<string, CliCommand>();
  const byAliasPath = new Map<string, CliAliasMatch>();
  const mutableChildren = new Map<string, CliCommand[]>();
  for (const command of program.commands) {
    byPath.set(pathKey(command.path), command);
    for (const alias of command.aliases) byAliasPath.set(pathKey(alias.path), Object.freeze({ command, alias }));
    if (command.parentPath !== undefined) {
      const key = pathKey(command.parentPath);
      const children = mutableChildren.get(key) ?? [];
      children.push(command);
      mutableChildren.set(key, children);
    }
  }
  const childrenByPath = new Map<string, readonly CliCommand[]>();
  for (const [key, children] of mutableChildren) childrenByPath.set(key, Object.freeze(children));
  return { byPath, byAliasPath, childrenByPath };
}

function lookupFor(program: CliProgram): CliCommandLookup {
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

function isIdentifier(value: unknown): value is string {
  return isNonEmptyString(value) && !/\s/u.test(value);
}

function isFlag(value: unknown): value is string {
  return typeof value === 'string' && /^(?:-[^-\s=]|--[^-\s=][^\s=]*)$/u.test(value);
}

function freezeFlags(flags: readonly [string, ...string[]]): readonly [string, ...string[]] {
  const [first, ...rest] = flags;
  return Object.freeze([first, ...rest]);
}

function freezeIssue(issue: CliDefinitionIssue): CliDefinitionIssue {
  return Object.freeze(issue);
}
