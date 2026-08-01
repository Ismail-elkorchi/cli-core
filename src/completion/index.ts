import {
  findCliCommand,
  findCliCommandChildren,
  type CliCommand,
  type CliDefinition,
  type CliProgram
} from '../command/index.ts';

/** Input for command-local completion candidate generation. */
export interface CliCompletionInput {
  readonly commandPath?: readonly string[];
  readonly prefix?: string;
  readonly includeHidden?: boolean;
  /** Option whose value is currently being entered. */
  readonly option?: string;
  /** Presence state used to omit scalar options that reject repetition. */
  readonly specifiedOptions?: Readonly<Record<string, boolean>>;
}

/** One completion candidate. */
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
      readonly setsBoolean?: boolean;
    }
  | {
      readonly kind: 'option-value';
      readonly value: string;
      readonly option: string;
      readonly description?: string;
    };

/** Returns candidates, or `undefined` when the canonical command path is unknown. */
export function completeCli<Definition extends CliDefinition>(
  program: CliProgram<Definition>,
  input: CliCompletionInput = {}
): readonly CliCompletion[] | undefined {
  const command = findCliCommand(program, input.commandPath ?? []);
  if (command === undefined) return undefined;
  const prefix = input.prefix ?? '';
  const candidates = input.option === undefined
    ? [
        ...commandCandidates(program, command),
        ...flagCandidates(command, input)
      ]
    : valueCandidates(command, input.option);
  return Object.freeze(
    candidates.filter((candidate) => candidate.value.startsWith(prefix))
  );
}

function flagCandidates(
  command: CliCommand,
  input: CliCompletionInput
): CliCompletion[] {
  return command.options
    .filter((option) => (input.includeHidden ?? false) || !option.hidden)
    .filter((option) =>
      input.specifiedOptions?.[option.name] !== true || option.repeat !== 'error')
    .flatMap((option) => [
      ...option.flags.map((flag) => Object.freeze({
        kind: 'flag' as const,
        value: flag,
        option: option.name,
        ...(option.kind === 'boolean' ? { setsBoolean: true } : {}),
        ...(option.description === undefined ? {} : { description: option.description })
      })),
      ...option.falseFlags.map((flag) => Object.freeze({
        kind: 'flag' as const,
        value: flag,
        option: option.name,
        setsBoolean: false,
        ...(option.description === undefined ? {} : { description: option.description })
      }))
    ]);
}

function commandCandidates<Definition extends CliDefinition>(
  program: CliProgram<Definition>,
  command: CliCommand
): CliCompletion[] {
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
    })))
  ];
}

function valueCandidates(command: CliCommand, optionName: string): CliCompletion[] {
  const option = command.options.find((candidate) => candidate.name === optionName);
  if (option === undefined) return [];
  return option.valueCandidates.map((value) => Object.freeze({
    kind: 'option-value' as const,
    value,
    option: option.name,
    ...(option.description === undefined ? {} : { description: option.description })
  }));
}
