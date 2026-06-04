import {
  findCliCommand,
  findCliCommandChildren,
  type CliCommand,
  type CliCommandSource,
  type CliOption,
  type CliPositional,
  type CliProgram
} from '../command/index.ts';

/**
 * Machine-readable help document for a selected command.
 */
export interface HelpDocument {
  /** Schema version for this document. */
  readonly schemaVersion: 'cli-core.help.v1';
  /** Name of the CLI program. */
  readonly programName: string;
  /** Canonical command path for the invocation. */
  readonly commandPath: readonly string[];
  /** Usage line for the selected command. */
  readonly usage: string;
  /** Summary text for the help document. */
  readonly summary: string | undefined;
  /** Visible child commands for the selected command. */
  readonly commands: readonly HelpCommandEntry[];
  /** Positional entries shown for this command. */
  readonly positionals: readonly HelpPositionalEntry[];
  /** Option entries shown for this command. */
  readonly options: readonly HelpOptionEntry[];
}

/**
 * Command entry included in help output.
 */
export interface HelpCommandEntry {
  /** Command token shown in command listings. */
  readonly name: string;
  /** Canonical command path for this help entry. */
  readonly path: readonly string[];
  /** Aliases declared for this command. */
  readonly aliases: readonly string[];
  /** Summary text for the command. */
  readonly summary: string | undefined;
  /** Deprecation marker copied from the compiled command. */
  readonly deprecated: boolean | string | undefined;
  /** Provenance for this command. */
  readonly source: CliCommandSource;
}

/**
 * Positional entry included in help output.
 */
export interface HelpPositionalEntry {
  /** Positional key shown in usage and help output. */
  readonly name: string;
  /** Controls angle-bracket versus square-bracket usage rendering. */
  readonly required: boolean;
  /** Whether this positional captures remaining tokens. */
  readonly variadic: boolean;
  /** Rendered usage label for this positional. */
  readonly label: string;
  /** Summary text for the positional. */
  readonly summary: string | undefined;
}

/**
 * Option entry included in help output.
 */
export interface HelpOptionEntry {
  /** Option key shown beside accepted flags. */
  readonly name: string;
  /** Flag spellings accepted for this option. */
  readonly flags: readonly string[];
  /** Value category used to explain expected option input. */
  readonly type: string;
  /** Indicates whether parsing requires this option. */
  readonly required: boolean;
  /** Indicates whether the option is inherited or local. */
  readonly scope: 'global' | 'local';
  /** Summary text for the option. */
  readonly summary: string | undefined;
}

/**
 * Machine-readable version document.
 */
export interface VersionDocument {
  /** Schema version for this document. */
  readonly schemaVersion: 'cli-core.version.v1';
  /** Program name associated with the version. */
  readonly name: string;
  /** Program version, or undefined when the definition omitted one. */
  readonly version: string | undefined;
}

/**
 * Creates a machine-readable help document.
 */
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

/**
 * Creates a machine-readable version document.
 */
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
