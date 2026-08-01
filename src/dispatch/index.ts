import type { ParsedInvocationSuccess } from '../parse/index.ts';

/** Context supplied to a command handler. */
export interface CliHandlerContext<Invocation extends ParsedInvocationSuccess, Context> {
  readonly invocation: Invocation;
  readonly context: Context;
}

/** A command handler keyed by `CliCommand.key`. */
export type CliHandler<Invocation extends ParsedInvocationSuccess, Context, Result> = (
  input: CliHandlerContext<Invocation, Context>
) => Result | Promise<Result>;

/** Immutable handler collection keyed by canonical command key. */
export type CliHandlers<Invocation extends ParsedInvocationSuccess, Context, Result> = Readonly<
  Record<string, CliHandler<Invocation, Context, Result>>
>;

/** Error thrown when dispatch is attempted without a matching handler. */
export class CliHandlerNotFoundError extends Error {
  public readonly commandKey: string;

  public constructor(commandKey: string) {
    super(`No handler is registered for command ${commandKey}.`);
    this.name = 'CliHandlerNotFoundError';
    this.commandKey = commandKey;
  }
}

/** Dispatches a successful invocation. Handler failures propagate unchanged. */
export function dispatchCli<Invocation extends ParsedInvocationSuccess, Context, Result>(
  invocation: Invocation,
  handlers: CliHandlers<Invocation, Context, Result>,
  context: Context
): Promise<Result> {
  const handler = Object.hasOwn(handlers, invocation.command.key)
    ? handlers[invocation.command.key]
    : undefined;
  if (handler === undefined) return Promise.reject(new CliHandlerNotFoundError(invocation.command.key));
  return Promise.resolve().then(() => handler({ invocation, context }));
}
