import type { FlagSpec, FlagType, FlagValue } from 'argv-flags';
import type { ConfigDefinition } from '../config/index.js';
import { createCliDiagnostic, type CliDiagnostic } from '../diagnostics.js';

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

export function defineCli(definition: CliDefinition): CliProgram {
  const diagnostics: CliDiagnostic[] = [];
  const globalOptions = Object.freeze((definition.options ?? []).map((option) => compileOption(option, 'global')));
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
    compileCommandTree(commandDefinition, root, globalOptions, commands);
  }

  const pathIndex = buildPathIndex(commands, diagnostics);
  const aliasIndex = buildAliasIndex(commands, pathIndex, diagnostics);
  const program = buildProgram(definition, root, commands, pathIndex, aliasIndex, diagnostics);
  return freezeProgram(program);
}

export function findCliCommand(program: CliProgram, path: readonly string[]): CliCommand | undefined {
  const commandId = findCommandId(program.pathIndex, path);
  if (commandId === undefined) return undefined;
  return program.commands.find((command) => command.id === commandId);
}

export function findCliCommandByAlias(
  program: CliProgram,
  path: readonly string[]
): { readonly command: CliCommand; readonly alias: CliCommandAliasIndexEntry } | undefined {
  const alias = program.aliasIndex.find((entry) => samePath(entry.path, path));
  if (alias === undefined) return undefined;
  const command = program.commands.find((candidate) => candidate.id === alias.commandId);
  if (command === undefined) return undefined;
  return { command, alias };
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
  commands: CliCommand[]
): void {
  const path = Object.freeze([...parent.path, definition.name]);
  const optionalFields: { description?: string; deprecated?: boolean | string } = {};
  if (definition.description !== undefined) optionalFields.description = definition.description;
  if (definition.deprecated !== undefined) optionalFields.deprecated = definition.deprecated;
  const command = freezeCommand({
    id: path.join(':'),
    name: definition.name,
    path,
    parentId: parent.id,
    aliases: Object.freeze((definition.aliases ?? []).map((alias) => compileAlias(alias, parent.path))),
    source: freezeCommandSource(definition.source ?? definitionSource()),
    positionals: Object.freeze((definition.positionals ?? []).map(compilePositional)),
    options: Object.freeze((definition.options ?? []).map((option) => compileOption(option, 'local'))),
    inheritedOptions: globalOptions,
    allowPassThrough: definition.allowPassThrough ?? false,
    ...optionalFields
  });
  commands.push(command);

  for (const child of definition.commands ?? []) {
    compileCommandTree(child, command, globalOptions, commands);
  }
}

function compileAlias(input: CliAliasInput, parentPath: readonly string[]): CliAlias {
  const alias = typeof input === 'string' ? { name: input } : input;
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

  for (const command of commands) {
    for (const alias of command.aliases) {
      const key = pathKey(alias.path);
      const commandPath = pathIndex.find((entry) => samePath(entry.path, alias.path));
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

function findCommandId(index: readonly CliCommandPathIndexEntry[], path: readonly string[]): string | undefined {
  return index.find((entry) => samePath(entry.path, path))?.commandId;
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left.at(index) !== right.at(index)) return false;
  }
  return true;
}

function pathKey(path: readonly string[]): string {
  return path.join('\u0000');
}

function cloneOptionDefault<T extends CliOptionType>(value: CliOptionValue<T>): CliOptionValue<T> {
  if (Array.isArray(value)) {
    return Object.freeze([...value]) as CliOptionValue<T>;
  }
  return value;
}
