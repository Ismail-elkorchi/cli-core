interface CliDispatchTarget {
  readonly commandKey: string;
}

/** Context supplied to a command handler. */
export interface CliHandlerContext<Invocation extends CliDispatchTarget, Context> {
  readonly invocation: Invocation;
  readonly context: Context;
}

/** A command handler keyed by `CliCommand.key`. */
export type CliHandler<Invocation extends CliDispatchTarget, Context, Result> = (
  input: CliHandlerContext<Invocation, Context>
) => Result | Promise<Result>;

type InvocationCommandKey<Invocation extends CliDispatchTarget> =
  Invocation['commandKey'];

type InvocationForKey<
  Invocation extends CliDispatchTarget,
  Key extends string
> = Invocation extends CliDispatchTarget
  ? Invocation['commandKey'] extends Key
    ? Invocation
    : never
  : never;

/** Immutable handler collection restricted to canonical command keys. */
export type CliHandlers<Invocation extends CliDispatchTarget, Context, Result> = Readonly<
  {
    readonly [Key in InvocationCommandKey<Invocation>]: CliHandler<
      InvocationForKey<Invocation, Key>,
      Context,
      Result
    >;
  }
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
export function dispatchCli<Invocation extends CliDispatchTarget, Context, Result>(
  invocation: Invocation,
  handlers: CliHandlers<Invocation, Context, Result>,
  context: Context
): Promise<Result> {
  const handler: unknown = Object.getOwnPropertyDescriptor(handlers, invocation.commandKey)?.value;
  if (typeof handler !== 'function') {
    return Promise.reject(new CliHandlerNotFoundError(invocation.commandKey));
  }
  return Promise.resolve().then(() => handler({ invocation, context }));
}
