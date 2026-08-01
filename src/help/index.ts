import {
  findCliCommand,
  findCliCommandChildren,
  type CliCommand,
  type CliOption,
  type CliPositional,
  type CliProgram
} from '../command/index.ts';

/** Help data for one command. Rendering belongs to an integration package. */
export interface CliHelp {
  readonly command: CliCommand;
  readonly usage: string;
  readonly commands: readonly CliHelpCommand[];
  readonly positionals: readonly CliHelpPositional[];
  readonly options: readonly CliHelpOption[];
}

export interface CliHelpCommand {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description?: string;
  readonly deprecated?: boolean | string;
}

export interface CliHelpPositional {
  readonly name: string;
  readonly label: string;
  readonly required: boolean;
  readonly variadic: boolean;
  readonly description?: string;
}

export interface CliHelpOption {
  readonly name: string;
  readonly flags: readonly string[];
  readonly valueMode: CliOption['valueMode'];
  readonly valueLabel?: string;
  readonly required: boolean;
  readonly scope: CliOption['scope'];
  readonly description?: string;
}

/** Creates immutable help data for a canonical command path. */
export function createCliHelp(program: CliProgram, commandPath: readonly string[] = []): CliHelp {
  const command = findCliCommand(program, commandPath) ?? program.root;
  return Object.freeze({
    command,
    usage: createUsage(program, command),
    commands: Object.freeze(findCliCommandChildren(program, command).map(toHelpCommand)),
    positionals: Object.freeze(command.positionals.map(toHelpPositional)),
    options: Object.freeze(command.options.filter((option) => !option.hidden).map(toHelpOption))
  });
}

function createUsage(program: CliProgram, command: CliCommand): string {
  const parts = [program.name, ...command.path];
  if (command.options.some((option) => !option.hidden)) parts.push('[options]');
  parts.push(...command.positionals.map(positionalLabel));
  if (command.acceptsAfterDoubleDash) parts.push('[-- ...]');
  return parts.join(' ');
}

function toHelpCommand(command: CliCommand): CliHelpCommand {
  return Object.freeze({
    name: command.name,
    aliases: Object.freeze(command.aliases.map((alias) => alias.name)),
    ...(command.description === undefined ? {} : { description: command.description }),
    ...(command.deprecated === undefined ? {} : { deprecated: command.deprecated })
  });
}

function toHelpPositional(positional: CliPositional): CliHelpPositional {
  return Object.freeze({
    name: positional.name,
    label: positionalLabel(positional),
    required: positional.required,
    variadic: positional.variadic,
    ...(positional.description === undefined ? {} : { description: positional.description })
  });
}

function toHelpOption(option: CliOption): CliHelpOption {
  return Object.freeze({
    name: option.name,
    flags: option.flags,
    valueMode: option.valueMode,
    ...(option.valueLabel === undefined ? {} : { valueLabel: option.valueLabel }),
    required: option.required,
    scope: option.scope,
    ...(option.description === undefined ? {} : { description: option.description })
  });
}

function positionalLabel(positional: CliPositional): string {
  const name = positional.variadic ? `${positional.name}...` : positional.name;
  return positional.required ? `<${name}>` : `[${name}]`;
}
