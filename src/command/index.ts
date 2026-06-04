import type { FlagSpec, FlagType, FlagValue } from 'argv-flags';
import type { ConfigDefinition } from '../config/types.ts';
import { createCliDiagnostic, type CliDiagnostic } from '../diagnostics.ts';

export type CliOptionType = FlagType;

export type CliOptionValue<T extends CliOptionType = CliOptionType> = FlagValue<T>;

export interface CliDefinition {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  readonly config?: ConfigDefinition;
  readonly options?: readonly CliOptionDefinition[];
  readonly commands?: readonly CliCommandDefinition[];
}

export interface CliCommandDefinition {
  readonly name: string;
  readonly aliases?: readonly CliAliasInput[];
  readonly description?: string;
  readonly deprecated?: boolean | string;
  readonly source?: CliCommandSource;
  readonly positionals?: readonly CliPositionalDefinition[];
  readonly options?: readonly CliOptionDefinition[];
  readonly commands?: readonly CliCommandDefinition[];
  readonly allowPassThrough?: boolean;
}

export interface CliCommandSource {
  readonly kind: 'definition' | 'plugin';
  readonly pluginName?: string;
  readonly pluginVersion?: string;
}

export type CliAliasInput = string | CliAliasDefinition;

export interface CliAliasDefinition {
  readonly name: string;
  readonly deprecated?: boolean | string;
}

export interface CliPositionalDefinition {
  readonly name: string;
  readonly required?: boolean;
  readonly variadic?: boolean;
  readonly description?: string;
}

export interface CliOptionDefinition<T extends CliOptionType = CliOptionType> {
  readonly name: string;
  readonly type: T;
  readonly flags: readonly string[];
  readonly description?: string;
  readonly required?: boolean;
  readonly default?: CliOptionValue<T>;
  readonly allowEmpty?: boolean;
  readonly allowNo?: boolean;
  readonly hidden?: boolean;
}

export interface CliProgram {
  readonly schemaVersion: 'cli-core.program.v1';
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  readonly config: ConfigDefinition | undefined;
  readonly root: CliCommand;
  readonly commands: readonly CliCommand[];
  readonly pathIndex: readonly CliCommandPathIndexEntry[];
  readonly aliasIndex: readonly CliCommandAliasIndexEntry[];
  readonly diagnostics: readonly CliDiagnostic[];
}

export interface CliCommand {
  readonly id: string;
  readonly name: string;
  readonly path: readonly string[];
  readonly parentId?: string;
  readonly aliases: readonly CliAlias[];
  readonly description?: string;
  readonly deprecated?: boolean | string;
  readonly source: CliCommandSource;
  readonly positionals: readonly CliPositional[];
  readonly options: readonly CliOption[];
  readonly inheritedOptions: readonly CliOption[];
  readonly allowPassThrough: boolean;
}

export interface CliAlias {
  readonly name: string;
  readonly path: readonly string[];
  readonly deprecated?: boolean | string;
}

export interface CliPositional {
  readonly name: string;
  readonly required: boolean;
  readonly variadic: boolean;
  readonly description?: string;
}

export interface CliOption<T extends CliOptionType = CliOptionType> {
  readonly name: string;
  readonly type: T;
  readonly flags: readonly string[];
  readonly description?: string;
  readonly required: boolean;
  readonly default?: CliOptionValue<T>;
  readonly allowEmpty?: boolean;
  readonly allowNo?: boolean;
  readonly hidden: boolean;
  readonly scope: 'global' | 'local';
}

export interface CliCommandPathIndexEntry {
  readonly path: readonly string[];
  readonly commandId: string;
}

export interface CliCommandAliasIndexEntry {
  readonly path: readonly string[];
  readonly commandId: string;
  readonly alias: string;
  readonly deprecated?: boolean | string;
}

interface CliCommandLookupIndex {
  readonly byPath: ReadonlyMap<string, CliCommand>;
  readonly byAliasPath: ReadonlyMap<string, CliCommandAliasIndexEntry>;
  readonly byId: ReadonlyMap<string, CliCommand>;
  readonly childrenByParentId: ReadonlyMap<string, readonly CliCommand[]>;
}

const commandLookupIndexes = new WeakMap<CliProgram, CliCommandLookupIndex>();

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

export function findCliCommand(program: CliProgram, path: readonly string[]): CliCommand | undefined {
  return commandLookup(program).byPath.get(pathKey(path));
}

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

export function findCliCommandChildren(program: CliProgram, parentId: string): readonly CliCommand[] {
  return commandLookup(program).childrenByParentId.get(parentId) ?? Object.freeze([]);
}

export function createOptionSchema(options: readonly CliOption[]): Record<string, FlagSpec> {
  return Object.fromEntries(
    options.map((option) => [
      option.name,
      {
        type: option.type,
        flags: option.flags,
        required: option.required || undefined,
        default: option.default,
        allowEmpty: option.allowEmpty,
        allowNo: option.allowNo
      }
    ])
  ) as Record<string, FlagSpec>;
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
