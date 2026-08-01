import type { ConfigDefinition } from '../config/types.ts';
import { createCliDiagnostic, type CliDiagnostic } from '../diagnostics.ts';

/**
 * Option categories exposed to an option-binding integration.
 */
export type CliOptionType = 'string' | 'boolean' | 'number' | 'array';

/**
 * Runtime value shape associated with a compiled option category.
 */
export type CliOptionValue<T extends CliOptionType = CliOptionType> = T extends 'string'
  ? string
  : T extends 'boolean'
    ? boolean
    : T extends 'number'
      ? number
      : T extends 'array'
        ? string[]
        : never;

/**
 * Definition object compiled into an immutable command program.
 *
 * @remarks
 * Diagnostics are stored on the returned program instead of thrown, so callers can inspect invalid definitions as data.
 */
export interface CliDefinition {
  /** Root command token used in usage, help, and manifest documents. */
  readonly name: string;
  /** Program version surfaced by version and manifest documents. */
  readonly version?: string;
  /** Summary copied into root help and manifest output. */
  readonly description?: string;
  /** Config contract resolved separately from argv parsing. */
  readonly config?: ConfigDefinition;
  /** Global options inherited by each command. */
  readonly options?: readonly CliOptionDefinition[];
  /** Top-level commands below the program root. */
  readonly commands?: readonly CliCommandDefinition[];
}

/**
 * Command-tree node accepted by defineCli.
 */
export interface CliCommandDefinition {
  /** Command path token relative to the parent command. */
  readonly name: string;
  /** Alternate path tokens accepted beside the canonical command token. */
  readonly aliases?: readonly CliAliasInput[];
  /** Summary copied into help and manifest output for this command. */
  readonly description?: string;
  /** Deprecation marker preserved as diagnostics and manifest data. */
  readonly deprecated?: boolean | string;
  /** Provenance override for plugin-provided or generated command nodes. */
  readonly source?: CliCommandSource;
  /** Positional declarations bound after local option parsing. */
  readonly positionals?: readonly CliPositionalDefinition[];
  /** Local options available only in this command scope. */
  readonly options?: readonly CliOptionDefinition[];
  /** Nested commands below this command node. */
  readonly commands?: readonly CliCommandDefinition[];
  /** Whether tokens after the pass-through boundary are accepted. */
  readonly allowPassThrough?: boolean;
}

/**
 * Provenance attached to commands from definitions or plugin manifests.
 */
export interface CliCommandSource {
  /** Source category used for provenance-aware help and manifests. */
  readonly kind: 'definition' | 'plugin';
  /** Plugin identity when this command came from a plugin manifest. */
  readonly pluginName?: string;
  /** Plugin version recorded with command provenance. */
  readonly pluginVersion?: string;
}

/**
 * Alias spelling accepted in shorthand or structured form.
 */
export type CliAliasInput = string | CliAliasDefinition;

/**
 * Structured alias spelling with optional deprecation metadata.
 */
export interface CliAliasDefinition {
  /** Alias token relative to the command parent path. */
  readonly name: string;
  /** Deprecation marker emitted when this alias is used. */
  readonly deprecated?: boolean | string;
}

/**
 * Positional argument declaration used during invocation binding.
 */
export interface CliPositionalDefinition {
  /** Key used when this positional is returned from parsing. */
  readonly name: string;
  /** Controls missing-input diagnostics for this positional. */
  readonly required?: boolean;
  /** Whether this positional captures remaining tokens. */
  readonly variadic?: boolean;
  /** Summary copied into help and manifest output. */
  readonly description?: string;
}

/**
 * Logical option declaration compiled into command metadata.
 */
export interface CliOptionDefinition<T extends CliOptionType = CliOptionType> {
  /** Option key used in parsed values and config argv bindings. */
  readonly name: string;
  /** Value category supplied to option-binding integrations. */
  readonly type: T;
  /** Flag spellings accepted for this option. */
  readonly flags: readonly string[];
  /** Summary copied into help, manifests, and completion items. */
  readonly description?: string;
  /** Controls missing-option diagnostics after argv binding. */
  readonly required?: boolean;
  /** Default value when no explicit value is supplied. */
  readonly default?: CliOptionValue<T>;
  /** Whether an empty string value is accepted. */
  readonly allowEmpty?: boolean;
  /** Enables boolean negation for long boolean flags. */
  readonly allowNo?: boolean;
  /** Omits this option from default help and completion output. */
  readonly hidden?: boolean;
}

/**
 * Immutable command program returned by defineCli.
 *
 * @remarks
 * Arrays remain available for serialization, while lookup helpers use internal indexes for command, alias, and child lookup.
 */
export interface CliProgram {
  /** Schema version for this document. */
  readonly schemaVersion: 'cli-core.program.v1';
  /** Root command token retained from the source definition. */
  readonly name: string;
  /** Program version retained for version and manifest output. */
  readonly version?: string;
  /** Root summary retained for help and manifests. */
  readonly description?: string;
  /** Config contract retained for explicit config resolution. */
  readonly config: ConfigDefinition | undefined;
  /** Root command for the compiled program. */
  readonly root: CliCommand;
  /** Frozen command list including the root command. */
  readonly commands: readonly CliCommand[];
  /** Serializable index from command path to command id. */
  readonly pathIndex: readonly CliCommandPathIndexEntry[];
  /** Serializable index from alias path to command id. */
  readonly aliasIndex: readonly CliCommandAliasIndexEntry[];
  /** Definition diagnostics retained even when compilation succeeds. */
  readonly diagnostics: readonly CliDiagnostic[];
}

/**
 * Compiled command node with inherited options and provenance.
 */
export interface CliCommand {
  /** Internal command identifier used by handlers and indexes. */
  readonly id: string;
  /** Canonical command token at this path segment. */
  readonly name: string;
  /** Canonical command path from the program root. */
  readonly path: readonly string[];
  /** Identifier of the parent command when present. */
  readonly parentId?: string;
  /** Compiled aliases relative to this command's parent path. */
  readonly aliases: readonly CliAlias[];
  /** Summary used by help, manifests, and completion. */
  readonly description?: string;
  /** Deprecation marker retained for diagnostics and manifests. */
  readonly deprecated?: boolean | string;
  /** Provenance for this command. */
  readonly source: CliCommandSource;
  /** Positional declarations bound after option parsing. */
  readonly positionals: readonly CliPositional[];
  /** Local options available only for this command. */
  readonly options: readonly CliOption[];
  /** Global options inherited by this command. */
  readonly inheritedOptions: readonly CliOption[];
  /** Whether tokens after the pass-through boundary are accepted. */
  readonly allowPassThrough: boolean;
}

/**
 * Compiled alias that points at a canonical command path.
 */
export interface CliAlias {
  /** Alias token at the final alias path segment. */
  readonly name: string;
  /** Command path reached by this alias. */
  readonly path: readonly string[];
  /** Deprecation marker emitted when this alias is used. */
  readonly deprecated?: boolean | string;
}

/**
 * Compiled positional argument used by parse binding.
 */
export interface CliPositional {
  /** Key used in parsed positional output. */
  readonly name: string;
  /** Controls missing-input diagnostics for this positional. */
  readonly required: boolean;
  /** Whether this positional captures remaining tokens. */
  readonly variadic: boolean;
  /** Summary used in help and manifest output. */
  readonly description?: string;
}

/**
 * Compiled option visible to parsing, help, manifests, and completion.
 */
export interface CliOption<T extends CliOptionType = CliOptionType> {
  /** Option key used in parsed option output. */
  readonly name: string;
  /** Value category supplied to option-binding integrations. */
  readonly type: T;
  /** Flag spellings accepted for this option. */
  readonly flags: readonly string[];
  /** Summary used in help, manifests, and completion output. */
  readonly description?: string;
  /** Controls missing-option diagnostics after argv binding. */
  readonly required: boolean;
  /** Default value when no explicit value is supplied. */
  readonly default?: CliOptionValue<T>;
  /** Whether an empty string value is accepted. */
  readonly allowEmpty?: boolean;
  /** Enables boolean negation for long boolean flags. */
  readonly allowNo?: boolean;
  /** Omits this option from default help and completion output. */
  readonly hidden: boolean;
  /** Indicates whether this option was inherited or declared locally. */
  readonly scope: 'global' | 'local';
}

/**
 * Serializable command-path index entry.
 */
export interface CliCommandPathIndexEntry {
  /** Command path indexed by this entry. */
  readonly path: readonly string[];
  /** Identifier of the referenced command. */
  readonly commandId: string;
}

/**
 * Serializable alias-path index entry.
 */
export interface CliCommandAliasIndexEntry {
  /** Alias path indexed by this entry. */
  readonly path: readonly string[];
  /** Identifier of the referenced command. */
  readonly commandId: string;
  /** Final alias token that matched this index entry. */
  readonly alias: string;
  /** Deprecation marker emitted when this alias path is used. */
  readonly deprecated?: boolean | string;
}

interface CliCommandLookupIndex {
  readonly byPath: ReadonlyMap<string, CliCommand>;
  readonly byAliasPath: ReadonlyMap<string, CliCommandAliasIndexEntry>;
  readonly byId: ReadonlyMap<string, CliCommand>;
  readonly childrenByParentId: ReadonlyMap<string, readonly CliCommand[]>;
}

const commandLookupIndexes = new WeakMap<CliProgram, CliCommandLookupIndex>();

/**
 * Compiles a command definition into an immutable program.
 *
 * @remarks
 * The returned program carries diagnostics for invalid definitions instead of throwing, which keeps definition review machine-readable.
 *
 * @example
 * ```ts
 * import { defineCli } from '@ismail-elkorchi/cli-core';
 *
 * const program = defineCli({
 *   name: 'ship',
 *   commands: [{ name: 'deploy', aliases: ['d'] }]
 * });
 *
 * if (program.diagnostics.length > 0) {
 *   // Invalid definitions are reported as data rather than thrown.
 * }
 * ```
 */
export function defineCli(definition: CliDefinition): CliProgram {
  const diagnostics: CliDiagnostic[] = [];
  if (!isValidPathToken(definition.name)) {
    diagnostics.push(createCliDiagnostic('CLI_COMMAND_NAME_INVALID', 'error', 'Program name must be a non-empty path token.', {
      path: [],
      name: definition.name,
      role: 'root'
    }));
  }
  const globalOptions = compileOptions(definition.options ?? [], 'global', diagnostics, []);
  const rootOptionalFields: { description?: string } = {};
  if (definition.description !== undefined) rootOptionalFields.description = definition.description;
  const root = freezeCommand({
    id: 'root',
    name: definition.name,
    path: [],
    aliases: [],
    source: definitionSource(),
    positionals: [],
    options: [],
    inheritedOptions: globalOptions,
    allowPassThrough: false,
    ...rootOptionalFields
  });
  const commands = [root];

  for (const commandDefinition of definition.commands ?? []) {
    compileCommandTree(commandDefinition, root, globalOptions, commands, diagnostics);
  }

  const pathIndex = buildPathIndex(commands, diagnostics);
  const aliasIndex = buildAliasIndex(commands, pathIndex, diagnostics);
  const program = buildProgram(definition, root, commands, pathIndex, aliasIndex, diagnostics);
  const frozenProgram = freezeProgram(program);
  commandLookupIndexes.set(frozenProgram, createCommandLookupIndex(frozenProgram));
  return frozenProgram;
}

/**
 * Looks up a compiled command by canonical path.
 */
export function findCliCommand(program: CliProgram, path: readonly string[]): CliCommand | undefined {
  return commandLookup(program).byPath.get(pathKey(path));
}

/**
 * Looks up a compiled command by alias path.
 */
export function findCliCommandByAlias(
  program: CliProgram,
  path: readonly string[]
): { readonly command: CliCommand; readonly alias: CliCommandAliasIndexEntry } | undefined {
  const lookup = commandLookup(program);
  const alias = lookup.byAliasPath.get(pathKey(path));
  if (alias === undefined) return undefined;
  const command = lookup.byId.get(alias.commandId);
  if (command === undefined) return undefined;
  return { command, alias };
}

/**
 * Returns child commands for a compiled parent command.
 */
export function findCliCommandChildren(program: CliProgram, parentId: string): readonly CliCommand[] {
  return commandLookup(program).childrenByParentId.get(parentId) ?? Object.freeze([]);
}

function compileCommandTree(
  definition: CliCommandDefinition,
  parent: CliCommand,
  globalOptions: readonly CliOption[],
  commands: CliCommand[],
  diagnostics: CliDiagnostic[]
): void {
  const path = Object.freeze([...parent.path, definition.name]);
  if (!isValidPathToken(definition.name)) {
    diagnostics.push(createCliDiagnostic('CLI_COMMAND_NAME_INVALID', 'error', 'Command name must be a non-empty path token.', {
      path,
      name: definition.name,
      parentPath: parent.path
    }));
    return;
  }
  const optionalFields: { description?: string; deprecated?: boolean | string } = {};
  if (definition.description !== undefined) optionalFields.description = definition.description;
  if (definition.deprecated !== undefined) optionalFields.deprecated = definition.deprecated;
  const command = freezeCommand({
    id: path.join(':'),
    name: definition.name,
    path,
    parentId: parent.id,
    aliases: compileAliases(definition.aliases ?? [], parent.path, diagnostics),
    source: freezeCommandSource(definition.source ?? definitionSource()),
    positionals: compilePositionals(definition.positionals ?? [], diagnostics, path),
    options: compileOptions(definition.options ?? [], 'local', diagnostics, path, globalOptions),
    inheritedOptions: globalOptions,
    allowPassThrough: definition.allowPassThrough ?? false,
    ...optionalFields
  });
  commands.push(command);

  for (const child of definition.commands ?? []) {
    compileCommandTree(child, command, globalOptions, commands, diagnostics);
  }
}

function compileAliases(
  inputs: readonly CliAliasInput[],
  parentPath: readonly string[],
  diagnostics: CliDiagnostic[]
): readonly CliAlias[] {
  const aliases: CliAlias[] = [];
  for (const input of inputs) {
    const alias = compileAlias(input, parentPath, diagnostics);
    if (alias !== undefined) aliases.push(alias);
  }
  return Object.freeze(aliases);
}

function compileAlias(input: CliAliasInput, parentPath: readonly string[], diagnostics: CliDiagnostic[]): CliAlias | undefined {
  const alias = typeof input === 'string' ? { name: input } : input;
  if (!isValidPathToken(alias.name)) {
    diagnostics.push(createCliDiagnostic('CLI_COMMAND_ALIAS_INVALID', 'error', 'Command alias must be a non-empty path token.', {
      path: Object.freeze([...parentPath, alias.name]),
      alias: alias.name,
      parentPath
    }));
    return undefined;
  }
  const compiled = alias.deprecated === undefined
    ? {
        name: alias.name,
        path: Object.freeze([...parentPath, alias.name])
      }
    : {
        name: alias.name,
        path: Object.freeze([...parentPath, alias.name]),
        deprecated: alias.deprecated
      };
  return Object.freeze(compiled);
}

function compilePositionals(
  definitions: readonly CliPositionalDefinition[],
  diagnostics: CliDiagnostic[],
  commandPath: readonly string[]
): readonly CliPositional[] {
  const positionals: CliPositional[] = [];
  let optionalSeen = false;
  let variadicSeen = false;
  for (const [index, definition] of definitions.entries()) {
    const required = definition.required ?? true;
    const variadic = definition.variadic ?? false;
    if (!isValidPathToken(definition.name)) {
      diagnostics.push(positionalDiagnostic(commandPath, definition.name, 'name', index));
      continue;
    }
    if (variadicSeen) {
      diagnostics.push(positionalDiagnostic(commandPath, definition.name, 'after_variadic', index));
      continue;
    }
    if (required && optionalSeen) {
      diagnostics.push(positionalDiagnostic(commandPath, definition.name, 'required_after_optional', index));
    }
    if (variadic && index < definitions.length - 1) {
      diagnostics.push(positionalDiagnostic(commandPath, definition.name, 'variadic_not_last', index));
    }
    if (!required) optionalSeen = true;
    if (variadic) variadicSeen = true;
    positionals.push(compilePositional(definition));
  }
  return Object.freeze(positionals);
}

function compilePositional(definition: CliPositionalDefinition): CliPositional {
  const positional = definition.description === undefined
    ? {
        name: definition.name,
        required: definition.required ?? true,
        variadic: definition.variadic ?? false
      }
    : {
        name: definition.name,
        required: definition.required ?? true,
        variadic: definition.variadic ?? false,
        description: definition.description
      };
  return Object.freeze(positional);
}

function positionalDiagnostic(
  commandPath: readonly string[],
  name: string,
  reason: string,
  index: number
): CliDiagnostic {
  return createCliDiagnostic('CLI_POSITIONAL_INVALID', 'error', 'Command positional definition is invalid.', {
    commandPath,
    name,
    reason,
    index
  });
}

function compileOptions<T extends CliOptionType>(
  definitions: readonly CliOptionDefinition<T>[],
  scope: 'global' | 'local',
  diagnostics: CliDiagnostic[],
  commandPath: readonly string[],
  inheritedOptions: readonly CliOption[] = []
): readonly CliOption<T>[] {
  const options: CliOption<T>[] = [];
  const names = new Set(inheritedOptions.map((option) => option.name));
  const flagOwners = new Map<string, string>();
  for (const option of inheritedOptions) {
    for (const flag of option.flags) flagOwners.set(flag, option.name);
  }

  for (const definition of definitions) {
    if (!isValidOptionName(definition.name)) {
      diagnostics.push(optionDiagnostic('CLI_OPTION_NAME_INVALID', commandPath, definition.name, scope, { reason: 'name' }));
      continue;
    }
    if (names.has(definition.name)) {
      diagnostics.push(optionDiagnostic('CLI_OPTION_NAME_DUPLICATE', commandPath, definition.name, scope));
      continue;
    }
    if (definition.allowNo !== undefined && definition.type !== 'boolean') {
      diagnostics.push(optionDiagnostic('CLI_OPTION_FLAG_INVALID', commandPath, definition.name, scope, {
        flag: 'allowNo',
        reason: 'allowNo is only valid for boolean options.'
      }));
      continue;
    }
    if (definition.allowEmpty !== undefined && definition.type !== 'string' && definition.type !== 'array') {
      diagnostics.push(optionDiagnostic('CLI_OPTION_FLAG_INVALID', commandPath, definition.name, scope, {
        flag: 'allowEmpty',
        reason: 'allowEmpty is only valid for string or array options.'
      }));
      continue;
    }
    const invalidFlag = definition.flags.find((flag) => !isValidOptionFlag(flag));
    if (definition.flags.length === 0 || invalidFlag !== undefined) {
      diagnostics.push(optionDiagnostic('CLI_OPTION_FLAG_INVALID', commandPath, definition.name, scope, {
        flag: invalidFlag ?? ''
      }));
      continue;
    }
    const duplicateFlag = definition.flags.find((flag, index) =>
      definition.flags.indexOf(flag) !== index || flagOwners.has(flag)
    );
    if (duplicateFlag !== undefined) {
      diagnostics.push(optionDiagnostic('CLI_OPTION_FLAG_DUPLICATE', commandPath, definition.name, scope, {
        flag: duplicateFlag,
        existingOption: flagOwners.get(duplicateFlag) ?? definition.name
      }));
      continue;
    }
    const option = compileOption(definition, scope);
    names.add(option.name);
    for (const flag of option.flags) flagOwners.set(flag, option.name);
    options.push(option);
  }

  return Object.freeze(options);
}

function optionDiagnostic(
  code: 'CLI_OPTION_NAME_INVALID' | 'CLI_OPTION_NAME_DUPLICATE' | 'CLI_OPTION_FLAG_INVALID' | 'CLI_OPTION_FLAG_DUPLICATE',
  commandPath: readonly string[],
  option: string,
  scope: 'global' | 'local',
  fields: Readonly<Record<string, string>> = {}
): CliDiagnostic {
  return createCliDiagnostic(code, 'error', 'Command option definition is invalid.', {
    commandPath,
    option,
    scope,
    ...fields
  });
}

function compileOption<T extends CliOptionType>(
  definition: CliOptionDefinition<T>,
  scope: 'global' | 'local'
): CliOption<T> {
  const optionBase = {
    name: definition.name,
    type: definition.type,
    flags: Object.freeze([...definition.flags]),
    required: definition.required ?? false,
    hidden: definition.hidden ?? false,
    scope
  };
  const optionalFields: {
    description?: string;
    default?: CliOptionValue<T>;
    allowEmpty?: boolean;
    allowNo?: boolean;
  } = {};
  if (definition.description !== undefined) optionalFields.description = definition.description;
  if (definition.default !== undefined) optionalFields.default = cloneOptionDefault(definition.default);
  if (definition.allowEmpty !== undefined) optionalFields.allowEmpty = definition.allowEmpty;
  if (definition.allowNo !== undefined) optionalFields.allowNo = definition.allowNo;

  return Object.freeze({
    ...optionBase,
    ...optionalFields
  }) as CliOption<T>;
}

function buildPathIndex(commands: readonly CliCommand[], diagnostics: CliDiagnostic[]): readonly CliCommandPathIndexEntry[] {
  const entries: CliCommandPathIndexEntry[] = [];
  const seen = new Map<string, CliCommand>();

  for (const command of commands) {
    const key = pathKey(command.path);
    const existing = seen.get(key);
    if (existing !== undefined) {
      diagnostics.push(
        createCliDiagnostic('CLI_DUPLICATE_COMMAND_PATH', 'error', 'Command path is already defined.', {
          path: command.path,
          commandId: command.id,
          existingCommandId: existing.id
        })
      );
      continue;
    }
    seen.set(key, command);
    entries.push(Object.freeze({ path: command.path, commandId: command.id }));
  }

  return Object.freeze(entries);
}

function buildAliasIndex(
  commands: readonly CliCommand[],
  pathIndex: readonly CliCommandPathIndexEntry[],
  diagnostics: CliDiagnostic[]
): readonly CliCommandAliasIndexEntry[] {
  const entries: CliCommandAliasIndexEntry[] = [];
  const seen = new Map<string, CliCommandAliasIndexEntry>();
  const commandPaths = new Map(pathIndex.map((entry) => [pathKey(entry.path), entry]));

  for (const command of commands) {
    for (const alias of command.aliases) {
      const key = pathKey(alias.path);
      const commandPath = commandPaths.get(key);
      if (commandPath !== undefined) {
        diagnostics.push(
          createCliDiagnostic('CLI_ALIAS_CONFLICTS_WITH_COMMAND', 'error', 'Command alias conflicts with a command path.', {
            path: alias.path,
            commandId: command.id,
            existingCommandId: commandPath.commandId
          })
        );
        continue;
      }
      const existing = seen.get(key);
      if (existing !== undefined) {
        diagnostics.push(
          createCliDiagnostic('CLI_DUPLICATE_COMMAND_ALIAS', 'error', 'Command alias is already defined.', {
            path: alias.path,
            commandId: command.id,
            existingCommandId: existing.commandId
          })
        );
        continue;
      }
      const entry = alias.deprecated === undefined
        ? { path: alias.path, commandId: command.id, alias: alias.name }
        : { path: alias.path, commandId: command.id, alias: alias.name, deprecated: alias.deprecated };
      const frozenEntry = Object.freeze(entry);
      seen.set(key, frozenEntry);
      entries.push(frozenEntry);
    }
  }

  return Object.freeze(entries);
}

function buildProgram(
  definition: CliDefinition,
  root: CliCommand,
  commands: readonly CliCommand[],
  pathIndex: readonly CliCommandPathIndexEntry[],
  aliasIndex: readonly CliCommandAliasIndexEntry[],
  diagnostics: readonly CliDiagnostic[]
): CliProgram {
  const baseProgram = {
    schemaVersion: 'cli-core.program.v1' as const,
    name: definition.name,
    config: definition.config,
    root,
    commands: Object.freeze([...commands]),
    pathIndex,
    aliasIndex,
    diagnostics: Object.freeze([...diagnostics])
  };
  const optionalFields: { version?: string; description?: string } = {};
  if (definition.version !== undefined) optionalFields.version = definition.version;
  if (definition.description !== undefined) optionalFields.description = definition.description;
  return { ...baseProgram, ...optionalFields };
}

function freezeCommand(command: CliCommand): CliCommand {
  return Object.freeze({
    ...command,
    path: Object.freeze([...command.path]),
    aliases: Object.freeze([...command.aliases]),
    source: freezeCommandSource(command.source),
    positionals: Object.freeze([...command.positionals]),
    options: Object.freeze([...command.options]),
    inheritedOptions: Object.freeze([...command.inheritedOptions])
  });
}

function definitionSource(): CliCommandSource {
  return Object.freeze({ kind: 'definition' });
}

function freezeCommandSource(source: CliCommandSource): CliCommandSource {
  const optionalFields: { pluginName?: string; pluginVersion?: string } = {};
  if (source.pluginName !== undefined) optionalFields.pluginName = source.pluginName;
  if (source.pluginVersion !== undefined) optionalFields.pluginVersion = source.pluginVersion;
  return Object.freeze({ kind: source.kind, ...optionalFields });
}

function freezeProgram(program: CliProgram): CliProgram {
  return Object.freeze({
    ...program,
    commands: Object.freeze([...program.commands]),
    pathIndex: Object.freeze([...program.pathIndex]),
    aliasIndex: Object.freeze([...program.aliasIndex]),
    diagnostics: Object.freeze([...program.diagnostics])
  });
}

function commandLookup(program: CliProgram): CliCommandLookupIndex {
  const existing = commandLookupIndexes.get(program);
  if (existing !== undefined) return existing;
  const rebuilt = createCommandLookupIndex(program);
  commandLookupIndexes.set(program, rebuilt);
  return rebuilt;
}

function createCommandLookupIndex(program: CliProgram): CliCommandLookupIndex {
  const byId = new Map(program.commands.map((command) => [command.id, command]));
  const byPath = new Map<string, CliCommand>();
  for (const entry of program.pathIndex) {
    const command = byId.get(entry.commandId);
    if (command !== undefined) byPath.set(pathKey(entry.path), command);
  }
  const byAliasPath = new Map(program.aliasIndex.map((entry) => [pathKey(entry.path), entry]));
  const children = new Map<string, CliCommand[]>();
  for (const command of program.commands) {
    if (command.parentId === undefined) continue;
    const existing = children.get(command.parentId) ?? [];
    existing.push(command);
    children.set(command.parentId, existing);
  }
  return Object.freeze({
    byPath,
    byAliasPath,
    byId,
    childrenByParentId: new Map([...children].map(([parentId, items]) => [parentId, Object.freeze([...items])]))
  });
}

function pathKey(path: readonly string[]): string {
  return path.join('\u0000');
}

function isValidPathToken(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && !value.includes('\u0000');
}

function isValidOptionName(value: string): boolean {
  return isValidPathToken(value);
}

function isValidOptionFlag(value: string): boolean {
  if (value.length < 2 || !value.startsWith('-')) {
    return false;
  }
  if (value === '--' || value.includes('=') || value.includes(' ') || value.includes('\u0000')) {
    return false;
  }
  if (value.startsWith('--no-')) {
    return false;
  }
  if (value.startsWith('--')) {
    return /^--[a-zA-Z][A-Za-z0-9-]*$/u.test(value);
  }
  return /^-[a-zA-Z0-9]$/u.test(value) || /^-[a-zA-Z0-9][a-zA-Z0-9-]*$/u.test(value);
}

function cloneOptionDefault<T extends CliOptionType>(value: CliOptionValue<T>): CliOptionValue<T> {
  if (Array.isArray(value)) {
    return Object.freeze([...value]) as CliOptionValue<T>;
  }
  return value;
}
