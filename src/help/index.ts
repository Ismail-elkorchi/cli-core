import {
  findCliCommand,
  findCliCommandChildren,
  type CliCommand,
  type CliCommandSource,
  type CliOption,
  type CliPositional,
  type CliProgram
} from '../command/index.js';
import { cliCorePackage } from '../package.js';

export { cliCorePackage };
export type { CliCorePackage } from '../package.js';

export interface HelpDocument {
  readonly schemaVersion: 'cli-core.help.v1';
  readonly programName: string;
  readonly commandPath: readonly string[];
  readonly usage: string;
  readonly summary: string | undefined;
  readonly commands: readonly HelpCommandEntry[];
  readonly positionals: readonly HelpPositionalEntry[];
  readonly options: readonly HelpOptionEntry[];
}

export interface HelpCommandEntry {
  readonly name: string;
  readonly path: readonly string[];
  readonly aliases: readonly string[];
  readonly summary: string | undefined;
  readonly deprecated: boolean | string | undefined;
  readonly source: CliCommandSource;
}

export interface HelpPositionalEntry {
  readonly name: string;
  readonly required: boolean;
  readonly variadic: boolean;
  readonly label: string;
  readonly summary: string | undefined;
}

export interface HelpOptionEntry {
  readonly name: string;
  readonly flags: readonly string[];
  readonly type: string;
  readonly required: boolean;
  readonly scope: 'global' | 'local';
  readonly summary: string | undefined;
}

export interface VersionDocument {
  readonly schemaVersion: 'cli-core.version.v1';
  readonly name: string;
  readonly version: string | undefined;
}

export function createHelpDocument(program: CliProgram, commandPath: readonly string[] = []): HelpDocument {
  const command = findCliCommand(program, commandPath) ?? program.root;
  const childCommands = findCliCommandChildren(program, command.id);
  return Object.freeze({
    schemaVersion: 'cli-core.help.v1',
    programName: program.name,
    commandPath: command.path,
    usage: buildUsage(program, command),
    summary: command.description,
    commands: Object.freeze(childCommands.map(toHelpCommandEntry)),
    positionals: Object.freeze(command.positionals.map(toHelpPositionalEntry)),
    options: Object.freeze([...command.inheritedOptions, ...command.options].filter((option) => !option.hidden).map(toHelpOptionEntry))
  });
}

export function createVersionDocument(program: CliProgram): VersionDocument {
  return Object.freeze({
    schemaVersion: 'cli-core.version.v1',
    name: program.name,
    version: program.version
  });
}

function buildUsage(program: CliProgram, command: CliCommand): string {
  const parts = [program.name, ...command.path];
  const options = [...command.inheritedOptions, ...command.options].filter((option) => !option.hidden);
  if (options.length > 0) parts.push('[options]');
  for (const positional of command.positionals) {
    parts.push(formatPositional(positional));
  }
  if (command.allowPassThrough) parts.push('[-- ...]');
  return parts.join(' ');
}

function toHelpCommandEntry(command: CliCommand): HelpCommandEntry {
  return Object.freeze({
    name: command.name,
    path: command.path,
    aliases: Object.freeze(command.aliases.map((alias) => alias.name)),
    summary: command.description,
    deprecated: command.deprecated,
    source: Object.freeze({ ...command.source })
  });
}

function toHelpPositionalEntry(positional: CliPositional): HelpPositionalEntry {
  return Object.freeze({
    name: positional.name,
    required: positional.required,
    variadic: positional.variadic,
    label: formatPositional(positional),
    summary: positional.description
  });
}

function toHelpOptionEntry(option: CliOption): HelpOptionEntry {
  return Object.freeze({
    name: option.name,
    flags: option.flags,
    type: option.type,
    required: option.required,
    scope: option.scope,
    summary: option.description
  });
}

function formatPositional(positional: CliPositional): string {
  const body = positional.variadic ? `${positional.name}...` : positional.name;
  return positional.required ? `<${body}>` : `[${body}]`;
}
