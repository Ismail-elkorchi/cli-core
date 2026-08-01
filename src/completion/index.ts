import { findCliCommand, findCliCommandChildren, type CliCommand, type CliProgram } from '../command/index.ts';

/** Input for command-local completion candidate generation. */
export interface CliCompletionInput {
  readonly commandPath?: readonly string[];
  readonly prefix?: string;
  readonly includeHidden?: boolean;
}

/** One token candidate. `flag` always means a concrete option spelling. */
export type CliCompletion =
  | {
      readonly kind: 'command';
      readonly value: string;
      readonly description?: string;
      readonly deprecated?: boolean | string;
    }
  | {
      readonly kind: 'alias';
      readonly value: string;
      readonly commandPath: readonly string[];
      readonly deprecated?: boolean | string;
    }
  | {
      readonly kind: 'flag';
      readonly value: string;
      readonly option: string;
      readonly description?: string;
    }
  | {
      readonly kind: 'positional';
      readonly value: string;
      readonly required: boolean;
      readonly variadic: boolean;
      readonly description?: string;
    };

/** Returns immutable command-local completion candidates. */
export function completeCli(program: CliProgram, input: CliCompletionInput = {}): readonly CliCompletion[] {
  const command = findCliCommand(program, input.commandPath ?? []) ?? program.root;
  const prefix = input.prefix ?? '';
  const candidates = prefix.startsWith('-')
    ? flagCandidates(command, input.includeHidden ?? false)
    : nonFlagCandidates(program, command);
  return Object.freeze(candidates.filter((candidate) => candidate.value.startsWith(prefix)));
}

function flagCandidates(command: CliCommand, includeHidden: boolean): CliCompletion[] {
  return command.options
    .filter((option) => includeHidden || !option.hidden)
    .flatMap((option) => option.flags.map((flag) => Object.freeze({
      kind: 'flag' as const,
      value: flag,
      option: option.name,
      ...(option.description === undefined ? {} : { description: option.description })
    })));
}

function nonFlagCandidates(program: CliProgram, command: CliCommand): CliCompletion[] {
  const children = findCliCommandChildren(program, command);
  return [
    ...children.map((child) => Object.freeze({
      kind: 'command' as const,
      value: child.name,
      ...(child.description === undefined ? {} : { description: child.description }),
      ...(child.deprecated === undefined ? {} : { deprecated: child.deprecated })
    })),
    ...children.flatMap((child) => child.aliases.map((alias) => Object.freeze({
      kind: 'alias' as const,
      value: alias.name,
      commandPath: child.path,
      ...(alias.deprecated === undefined ? {} : { deprecated: alias.deprecated })
    }))),
    ...command.positionals.map((positional) => Object.freeze({
      kind: 'positional' as const,
      value: positional.name,
      required: positional.required,
      variadic: positional.variadic,
      ...(positional.description === undefined ? {} : { description: positional.description })
    }))
  ];
}
