import {
  findCliCommand,
  findCliCommandChildren,
  type CliCommand,
  type CliDefinition,
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
  readonly invokable: boolean;
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
	readonly falseFlags: readonly string[];
	readonly valueMode: CliOption['valueMode'];
	readonly valueLabel?: string;
	readonly valueDescription?: string;
	readonly implicitValueLabel?: string;
	readonly required: boolean;
	readonly multiple: boolean;
	readonly repeat: CliOption['repeat'];
	readonly hasDefault: boolean;
	readonly defaultLabel?: string;
	readonly valueCandidates: readonly string[];
	readonly definedAt: readonly string[];
	readonly description?: string;
}

/** Creates immutable help data, or `undefined` for an unknown canonical path. */
export function createCliHelp<Definition extends CliDefinition>(
	program: CliProgram<Definition>,
	commandPath: readonly string[] = []
): CliHelp | undefined {
	const command = findCliCommand(program, commandPath);
	if (command === undefined) return undefined;
  return Object.freeze({
    command,
    usage: createUsage(program, command),
    commands: Object.freeze(findCliCommandChildren(program, command).map(toHelpCommand)),
    positionals: Object.freeze(command.positionals.map(toHelpPositional)),
    options: Object.freeze(command.options.filter((option) => !option.hidden).map(toHelpOption))
  });
}

function createUsage<Definition extends CliDefinition>(
  program: CliProgram<Definition>,
  command: CliCommand
): string {
  const parts = [program.name, ...command.path];
  if (command.options.some((option) => !option.hidden)) parts.push('[options]');
  const hasChildren = findCliCommandChildren(program, command).length > 0;
  if (hasChildren) parts.push(command.invokable ? '[command]' : '<command>');
  parts.push(...command.positionals.map(positionalLabel));
  if (command.acceptsPassthroughArguments) parts.push('[-- ...]');
  return parts.join(' ');
}

function toHelpCommand(command: CliCommand): CliHelpCommand {
  return Object.freeze({
    name: command.name,
    aliases: Object.freeze(command.aliases.map((alias) => alias.name)),
    invokable: command.invokable,
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
		falseFlags: option.falseFlags,
		valueMode: option.valueMode,
    ...(option.valueLabel === undefined ? {} : { valueLabel: option.valueLabel }),
		...(option.valueDescription === undefined
			? {}
			: { valueDescription: option.valueDescription }),
		...(option.implicitValueLabel === undefined
			? {}
			: { implicitValueLabel: option.implicitValueLabel }),
		required: option.required,
		multiple: option.multiple,
		repeat: option.repeat,
		hasDefault: option.hasDefault,
		...(option.defaultLabel === undefined ? {} : { defaultLabel: option.defaultLabel }),
		valueCandidates: option.valueCandidates,
		definedAt: option.definedAt,
    ...(option.description === undefined ? {} : { description: option.description })
  });
}

function positionalLabel(positional: CliPositional): string {
  const name = positional.variadic ? `${positional.name}...` : positional.name;
  return positional.required ? `<${name}>` : `[${name}]`;
}
