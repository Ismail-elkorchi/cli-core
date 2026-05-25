import type { CliCommand, CliProgram } from '../command/index.js';
import {
  createCliDiagnostic,
  hasErrorDiagnostics,
  type CliDiagnostic,
  type CliDiagnosticValue
} from '../diagnostics.js';
import { parseCli, type ParsedInvocation } from '../parse/index.js';
import type { CliPluginHookEvent, CliPluginHookRunResult, CliPluginHost } from '../plugins/index.js';
import { redactCliDiagnostics, redactCliSecrets, type CliRedactionOptions } from '../schema/index.js';

export type RunMode = 'plan' | 'apply';

export type RunIdentifier = string;

export type ExitKind =
  | 'ok'
  | 'usage'
  | 'policy_denied'
  | 'cancelled'
  | 'interrupted'
  | 'timeout'
  | 'external_error'
  | 'internal_error';

export type RunPayload = CliDiagnosticValue;

export interface RunRequest {
  readonly mode?: RunMode;
  readonly runId?: RunIdentifier;
  readonly argv?: readonly string[];
  readonly invocation?: ParsedInvocation;
  readonly handlers?: Readonly<Record<string, RunHandler>>;
  readonly effects?: readonly RunEffect[];
  readonly artifacts?: readonly RunArtifact[];
  readonly context?: RunPayload;
  readonly pluginHost?: CliPluginHost;
  readonly pluginContext?: RunPayload;
  readonly exitStatusPolicy?: ExitStatusPolicy;
  readonly redaction?: CliRedactionOptions;
  readonly cancelled?: boolean;
  readonly interrupted?: boolean;
  readonly timeoutMs?: number;
  readonly elapsedMs?: number;
}

export type RunHandler = (context: RunHandlerContext) => RunHandlerOutput | Promise<RunHandlerOutput>;

export interface RunHandlerContext {
  readonly runId: RunIdentifier;
  readonly mode: RunMode;
  readonly command: CliCommand;
  readonly invocation: ParsedInvocation;
  readonly context: RunPayload;
}

export interface RunHandlerOutput {
  readonly exitKind?: ExitKind;
  readonly exitStatus?: number;
  readonly effects?: readonly RunEffect[];
  readonly artifacts?: readonly RunArtifact[];
  readonly diagnostics?: readonly CliDiagnostic[];
}

export interface RunResult {
  readonly schemaVersion: 'cli-core.run-result.v1';
  readonly runId: RunIdentifier;
  readonly mode: RunMode;
  readonly invocation: ParsedInvocation;
  readonly ok: boolean;
  readonly exitKind: ExitKind;
  readonly exitStatus: number;
  readonly events: readonly RunEvent[];
  readonly effects: readonly RunEffect[];
  readonly artifacts: readonly RunArtifact[];
  readonly diagnostics: readonly CliDiagnostic[];
}

export interface RunEvent {
  readonly schemaVersion: 'cli-core.run-event.v1';
  readonly runId: RunIdentifier;
  readonly sequence: number;
  readonly name: RunEventName;
  readonly payload: RunPayload;
}

export type RunEventName =
  | 'run.started'
  | 'run.planned'
  | 'run.applied'
  | 'run.skipped'
  | 'plugin.hooks.planned'
  | 'plugin.hooks.completed'
  | 'run.completed';

export type RunEffect = SpawnRunEffect | FileRunEffect | PluginRunEffect | CustomRunEffect;

export interface SpawnRunEffect {
  readonly kind: 'spawn';
  readonly command: string;
  readonly argv: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
}

export interface FileRunEffect {
  readonly kind: 'write_file' | 'delete_path';
  readonly path: string;
  readonly content?: string;
}

export interface PluginRunEffect {
  readonly kind: 'plugin';
  readonly pluginName: string;
  readonly hookName: string;
  readonly event: CliPluginHookEvent;
  readonly effectKind: string;
  readonly payload?: RunPayload;
}

export interface CustomRunEffect {
  readonly kind: 'custom';
  readonly name: string;
  readonly payload?: RunPayload;
}

export interface RunArtifact {
  readonly id: string;
  readonly kind: string;
  readonly label?: string;
  readonly payload: RunPayload;
}

export type ExitStatusPolicy = Partial<Record<ExitKind, number>>;

const defaultExitStatusPolicy: Readonly<Record<ExitKind, number>> = Object.freeze({
  ok: 0,
  usage: 2,
  policy_denied: 3,
  cancelled: 130,
  interrupted: 130,
  timeout: 124,
  external_error: 1,
  internal_error: 1
});

export async function runCli(program: CliProgram, request: RunRequest): Promise<RunResult> {
  const mode = request.mode ?? 'plan';
  const invocation = request.invocation ?? parseCli(program, { argv: request.argv ?? [] });
  const runId = request.runId ?? createRunIdentifier(program, invocation, mode);
  const events = new RunEventRecorder(runId);
  const diagnostics: CliDiagnostic[] = [...invocation.diagnostics, ...effectDiagnostics(request.effects ?? [])];
  const effects = [...(request.effects ?? [])].map((effect) => freezeRunValue(effect));
  const artifacts = [...(request.artifacts ?? [])].map((artifact) => freezeRunValue(artifact));

  await runPluginLifecycle('init', request, invocation, events, effects, diagnostics);
  // In runCli, preparse is an observation hook over the parsed invocation.
  // It cannot mutate argv binding; command-tree extension must happen before
  // parse through applyCliPluginCommands.
  await runPluginLifecycle('preparse', request, invocation, events, effects, diagnostics);

  events.record('run.started', {
    mode,
    commandPath: invocation.commandPath,
    argv: invocation.argv
  });

  const interrupted = interruptionResult(request, invocation.commandPath);
  if (interrupted !== undefined) {
    diagnostics.push(interrupted.diagnostic);
    events.record('run.skipped', { reason: interrupted.exitKind });
    await runPluginLifecycle('finally', request, invocation, events, effects, diagnostics);
    return finishRun({
      runId,
      mode,
      invocation,
      exitKind: interrupted.exitKind,
      explicitExitStatus: undefined,
      diagnostics,
      effects,
      artifacts,
      events,
      policy: request.exitStatusPolicy,
      redaction: request.redaction
    });
  }

  if (!invocation.ok) {
    await runPluginLifecycle('command_not_found', request, invocation, events, effects, diagnostics);
    events.record('run.skipped', { reason: 'usage' });
    await runPluginLifecycle('finally', request, invocation, events, effects, diagnostics);
    return finishRun({
      runId,
      mode,
      invocation,
      exitKind: 'usage',
      explicitExitStatus: undefined,
      diagnostics,
      effects,
      artifacts,
      events,
      policy: request.exitStatusPolicy,
      redaction: request.redaction
    });
  }

  await runPluginLifecycle('prerun', request, invocation, events, effects, diagnostics);

  events.record('run.planned', {
    effects: effects.length,
    artifacts: artifacts.length
  });

  if (mode === 'plan') {
    await runPluginLifecycle('finally', request, invocation, events, effects, diagnostics);
    return finishRun({
      runId,
      mode,
      invocation,
      exitKind: hasErrorDiagnostics(diagnostics) ? 'policy_denied' : 'ok',
      explicitExitStatus: undefined,
      diagnostics,
      effects,
      artifacts,
      events,
      policy: request.exitStatusPolicy,
      redaction: request.redaction
    });
  }

  const command = invocation.command ?? program.root;
  const handler = findRunHandler(command, request.handlers);
  if (handler === undefined) {
    diagnostics.push(createCliDiagnostic('CLI_RUN_HANDLER_MISSING', 'error', 'No run handler is registered for the matched command.', {
      commandPath: invocation.commandPath
    }));
    events.record('run.skipped', { reason: 'missing_handler' });
    await runPluginLifecycle('finally', request, invocation, events, effects, diagnostics);
    return finishRun({
      runId,
      mode,
      invocation,
      exitKind: 'policy_denied',
      explicitExitStatus: undefined,
      diagnostics,
      effects,
      artifacts,
      events,
      policy: request.exitStatusPolicy,
      redaction: request.redaction
    });
  }

  try {
    const output = await handler(Object.freeze({
      runId,
      mode,
      command,
      invocation,
      context: freezeRunValue(request.context ?? null)
    }));
    effects.push(...(output.effects ?? []).map((effect) => freezeRunValue(effect)));
    artifacts.push(...(output.artifacts ?? []).map((artifact) => freezeRunValue(artifact)));
    diagnostics.push(...(output.diagnostics ?? []), ...effectDiagnostics(output.effects ?? []));
    events.record('run.applied', {
      effects: effects.length,
      artifacts: artifacts.length
    });
    if ((output.exitKind ?? (hasErrorDiagnostics(diagnostics) ? 'external_error' : 'ok')) === 'ok') {
      await runPluginLifecycle('postrun', request, invocation, events, effects, diagnostics);
    }
    await runPluginLifecycle('finally', request, invocation, events, effects, diagnostics);

    return finishRun({
      runId,
      mode,
      invocation,
      exitKind: output.exitKind ?? (hasErrorDiagnostics(diagnostics) ? 'external_error' : 'ok'),
      explicitExitStatus: output.exitStatus,
      diagnostics,
      effects,
      artifacts,
      events,
      policy: request.exitStatusPolicy,
      redaction: request.redaction
    });
  } catch (error) {
    diagnostics.push(createCliDiagnostic('CLI_RUN_HANDLER_FAILED', 'error', 'Run handler failed.', {
      commandPath: invocation.commandPath,
      errorMessage: errorMessage(error)
    }));
    events.record('run.skipped', { reason: 'handler_failed' });
    await runPluginLifecycle('finally', request, invocation, events, effects, diagnostics);
    return finishRun({
      runId,
      mode,
      invocation,
      exitKind: 'external_error',
      explicitExitStatus: undefined,
      diagnostics,
      effects,
      artifacts,
      events,
      policy: request.exitStatusPolicy,
      redaction: request.redaction
    });
  }
}

async function runPluginLifecycle(
  event: CliPluginHookEvent,
  request: RunRequest,
  invocation: ParsedInvocation,
  events: RunEventRecorder,
  effects: RunEffect[],
  diagnostics: CliDiagnostic[]
): Promise<void> {
  if (request.pluginHost === undefined) return;
  const plan = request.pluginHost.planHooks(event);
  events.record('plugin.hooks.planned', {
    event,
    hooks: plan.hooks.map((hook) => ({
      id: hook.id,
      pluginName: hook.pluginName,
      hookName: hook.hookName,
      order: hook.order
    }))
  });
  diagnostics.push(...plan.diagnostics);
  if (hasErrorDiagnostics(plan.diagnostics)) {
    events.record('plugin.hooks.completed', { event, status: 'failed', hooks: [] });
    return;
  }

  const result = await request.pluginHost.runHooks(event, {
    payload: pluginHookPayload(request, invocation)
  });
  diagnostics.push(...result.diagnostics);
  effects.push(...pluginRunEffects(result));
  events.record('plugin.hooks.completed', {
    event,
    status: result.ok ? 'passed' : 'failed',
    hooks: result.hooks.map((hook) => ({
      pluginName: hook.pluginName,
      hookName: hook.hookName,
      status: hook.status,
      effects: hook.effects.length,
      diagnostics: hook.diagnostics.length
    }))
  });
}

function pluginHookPayload(request: RunRequest, invocation: ParsedInvocation): RunPayload {
  return freezeRunValue({
    run: request.pluginContext ?? null,
    commandPath: invocation.commandPath,
    argv: invocation.argv,
    ok: invocation.ok
  });
}

function pluginRunEffects(result: CliPluginHookRunResult): readonly PluginRunEffect[] {
  return Object.freeze(result.hooks.flatMap((hook) =>
    hook.effects.map((effect) => {
      const optionalFields: { payload?: RunPayload } = {};
      if (effect.payload !== undefined) optionalFields.payload = freezeRunValue(effect.payload) as RunPayload;
      return Object.freeze({
        kind: 'plugin' as const,
        pluginName: hook.pluginName,
        hookName: hook.hookName,
        event: result.event,
        effectKind: effect.kind,
        ...optionalFields
      });
    })
  ));
}

interface FinishRunInput {
  readonly runId: RunIdentifier;
  readonly mode: RunMode;
  readonly invocation: ParsedInvocation;
  readonly exitKind: ExitKind;
  readonly explicitExitStatus: number | undefined;
  readonly diagnostics: readonly CliDiagnostic[];
  readonly effects: readonly RunEffect[];
  readonly artifacts: readonly RunArtifact[];
  readonly events: RunEventRecorder;
  readonly policy: ExitStatusPolicy | undefined;
  readonly redaction: CliRedactionOptions | undefined;
}

function finishRun(input: FinishRunInput): RunResult {
  const diagnostics = redactCliDiagnostics(input.diagnostics, input.redaction);
  const exitStatus = input.explicitExitStatus ?? exitStatusFor(input.exitKind, input.policy);
  input.events.record('run.completed', {
    exitKind: input.exitKind,
    exitStatus
  });
  const events = Object.freeze(input.events.snapshot().map((event) => redactCliSecrets(event, input.redaction) as RunEvent));
  const effects = Object.freeze(input.effects.map((effect) => redactCliSecrets(effect, input.redaction) as RunEffect));
  const artifacts = Object.freeze(input.artifacts.map((artifact) => redactCliSecrets(artifact, input.redaction) as RunArtifact));

  return Object.freeze({
    schemaVersion: 'cli-core.run-result.v1',
    runId: input.runId,
    mode: input.mode,
    invocation: input.invocation,
    ok: input.exitKind === 'ok' && !hasErrorDiagnostics(diagnostics),
    exitKind: input.exitKind,
    exitStatus,
    events,
    effects,
    artifacts,
    diagnostics
  });
}

function findRunHandler(command: CliCommand | undefined, handlers: Readonly<Record<string, RunHandler>> | undefined): RunHandler | undefined {
  if (command === undefined || handlers === undefined) return undefined;
  return handlers[command.id] ?? handlers[command.path.join(' ')] ?? handlers[command.name];
}

function interruptionResult(
  request: RunRequest,
  commandPath: readonly string[]
): { readonly exitKind: ExitKind; readonly diagnostic: CliDiagnostic } | undefined {
  if (request.cancelled === true) {
    return {
      exitKind: 'cancelled',
      diagnostic: createCliDiagnostic('CLI_RUN_CANCELLED', 'error', 'Run request was cancelled before execution.', { commandPath })
    };
  }
  if (request.interrupted === true) {
    return {
      exitKind: 'interrupted',
      diagnostic: createCliDiagnostic('CLI_RUN_INTERRUPTED', 'error', 'Run request was interrupted before execution.', { commandPath })
    };
  }
  if (request.timeoutMs !== undefined && request.elapsedMs !== undefined && request.elapsedMs > request.timeoutMs) {
    return {
      exitKind: 'timeout',
      diagnostic: createCliDiagnostic('CLI_RUN_TIMEOUT', 'error', 'Run request exceeded its timeout budget.', {
        commandPath,
        timeoutMs: request.timeoutMs,
        elapsedMs: request.elapsedMs
      })
    };
  }
  return undefined;
}

function effectDiagnostics(effects: readonly RunEffect[]): readonly CliDiagnostic[] {
  const diagnostics: CliDiagnostic[] = [];
  for (const effect of effects) {
    if (effect.kind === 'spawn') {
      if (effect.command.trim().length === 0) {
        diagnostics.push(createCliDiagnostic('CLI_RUN_INVALID_EFFECT', 'error', 'Spawn effect command is required.', {
          effect: effect.kind
        }));
      }
      if (!Array.isArray(effect.argv)) {
        diagnostics.push(createCliDiagnostic('CLI_RUN_INVALID_EFFECT', 'error', 'Spawn effect argv must be an array.', {
          effect: effect.kind,
          command: effect.command
        }));
      }
    }
  }
  return Object.freeze(diagnostics);
}

function exitStatusFor(kind: ExitKind, policy: ExitStatusPolicy | undefined): number {
  return policy?.[kind] ?? defaultExitStatusPolicy[kind];
}

function createRunIdentifier(program: CliProgram, invocation: ParsedInvocation, mode: RunMode): RunIdentifier {
  const seed = JSON.stringify([program.name, mode, invocation.argv, invocation.commandPath]);
  let hash = 5381;
  for (const char of seed) {
    hash = ((hash << 5) + hash) ^ char.charCodeAt(0);
  }
  return `run_${Math.abs(hash).toString(36)}`;
}

class RunEventRecorder {
  readonly #runId: RunIdentifier;
  readonly #events: RunEvent[] = [];

  public constructor(runId: RunIdentifier) {
    this.#runId = runId;
  }

  public record(name: RunEventName, payload: RunPayload): void {
    this.#events.push(Object.freeze({
      schemaVersion: 'cli-core.run-event.v1',
      runId: this.#runId,
      sequence: this.#events.length,
      name,
      payload: freezeRunValue(payload)
    }));
  }

  public snapshot(): readonly RunEvent[] {
    return Object.freeze([...this.#events]);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Unknown run handler error.';
}

function freezeRunValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => freezeRunValue(item))) as T;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, entryValue]) => [key, freezeRunValue(entryValue)] as const);
    return Object.freeze(Object.fromEntries(entries)) as T;
  }
  return value;
}
