import type { CliCommand, CliProgram } from '../command/index.ts';
import type { ConfigResolution } from '../config/index.ts';
import {
  createCliDiagnostic,
  hasErrorDiagnostics,
  type CliDiagnostic,
  type CliDiagnosticValue
} from '../diagnostics.ts';
import { parseCli, type ParsedInvocation, type SemanticValidationResult } from '../parse/index.ts';
import type { CliPluginHookEvent, CliPluginHookRunResult, CliPluginHost } from '../plugins/index.ts';
import { redactCliDiagnostics, redactCliSecrets, type CliRedactionOptions } from '../schema/index.ts';

/**
 * Run execution modes supported by runCli.
 */
export type RunMode = 'plan' | 'apply';

/**
 * Correlation identifier carried by run results and events.
 */
export type RunIdentifier = string;

/**
 * Machine-readable run exit classification.
 */
export type ExitKind =
  | 'ok'
  | 'parse_error'
  | 'config_error'
  | 'validation_error'
  | 'policy_denied'
  | 'cancelled'
  | 'interrupted'
  | 'timeout'
  | 'external_error'
  | 'internal_error';

/**
 * JSON-compatible payload carried by run events, effects, artifacts, and handlers.
 */
export type RunPayload = CliDiagnosticValue;

/**
 * Request envelope consumed by runCli.
 */
export interface RunRequest {
  /** Selects planning without handlers or apply execution with handlers. */
  readonly mode?: RunMode;
  /** Correlation identifier for this run. */
  readonly runId?: RunIdentifier;
  /** Tokens parsed when an invocation is not supplied. */
  readonly argv?: readonly string[];
  /** Parsed invocation used by this run. */
  readonly invocation?: ParsedInvocation;
  /** Run handlers keyed by command id, path, or name. */
  readonly handlers?: Readonly<Record<string, RunHandler>>;
  /** Config resolution whose diagnostics participate in exit classification. */
  readonly config?: ConfigResolution;
  /** Semantic validation result supplied by the caller. */
  readonly validation?: SemanticValidationResult;
  /** Effects supplied before handler execution. */
  readonly effects?: readonly RunEffect[];
  /** Artifacts supplied before handler execution. */
  readonly artifacts?: readonly RunArtifact[];
  /** Caller-provided JSON-compatible context. */
  readonly context?: RunPayload;
  /** Plugin host used for lifecycle hooks. */
  readonly pluginHost?: CliPluginHost;
  /** Context passed to plugin hooks. */
  readonly pluginContext?: RunPayload;
  /** Exit status overrides keyed by exit kind. */
  readonly exitStatusPolicy?: ExitStatusPolicy;
  /** Redaction options applied to returned data. */
  readonly redaction?: CliRedactionOptions;
  /** Whether the request was cancelled before execution. */
  readonly cancelled?: boolean;
  /** Whether the request was interrupted before execution. */
  readonly interrupted?: boolean;
  /** Timeout budget in milliseconds. */
  readonly timeoutMs?: number;
  /** Elapsed time in milliseconds. */
  readonly elapsedMs?: number;
  /** Optional sink that receives run events. */
  readonly eventSink?: RunEventSink;
}

/**
 * Observer called as run events are recorded.
 */
export type RunEventSink = (event: RunEvent) => void;

/**
 * Command handler invoked in apply mode.
 */
export type RunHandler = (context: RunHandlerContext) => RunHandlerOutput | Promise<RunHandlerOutput>;

/**
 * Immutable data passed to a run handler.
 */
export interface RunHandlerContext {
  /** Correlation identifier for this run. */
  readonly runId: RunIdentifier;
  /** Mode selected for this run. */
  readonly mode: RunMode;
  /** Command whose handler is being invoked. */
  readonly command: CliCommand;
  /** Parsed invocation used by this run. */
  readonly invocation: ParsedInvocation;
  /** Caller-provided JSON-compatible context. */
  readonly context: RunPayload;
}

/**
 * Data returned by a run handler.
 */
export interface RunHandlerOutput {
  /** Machine-readable exit classification. */
  readonly exitKind?: ExitKind;
  /** Process-style numeric exit status. */
  readonly exitStatus?: number;
  /** Effects produced by the handler. */
  readonly effects?: readonly RunEffect[];
  /** Artifacts produced by the handler. */
  readonly artifacts?: readonly RunArtifact[];
  /** Handler diagnostics folded into the run result. */
  readonly diagnostics?: readonly CliDiagnostic[];
}

/**
 * Structured result envelope returned by runCli.
 */
export interface RunResult {
  /** Schema version for this document. */
  readonly schemaVersion: 'cli-core.run-result.v1';
  /** Correlation identifier for this run. */
  readonly runId: RunIdentifier;
  /** Mode selected for this run. */
  readonly mode: RunMode;
  /** Parsed invocation used by this run. */
  readonly invocation: ParsedInvocation;
  /** False when diagnostics or exit policy classify the run as failing. */
  readonly ok: boolean;
  /** Machine-readable exit classification. */
  readonly exitKind: ExitKind;
  /** Process-style numeric exit status. */
  readonly exitStatus: number;
  /** Ordered events emitted during the run. */
  readonly events: readonly RunEvent[];
  /** Planned or emitted effects; adapters decide whether they are applied. */
  readonly effects: readonly RunEffect[];
  /** Artifacts planned or emitted by handlers and lifecycle hooks. */
  readonly artifacts: readonly RunArtifact[];
  /** Diagnostics from parse, config, validation, handlers, effects, and hooks. */
  readonly diagnostics: readonly CliDiagnostic[];
}

/**
 * Ordered lifecycle event emitted during a run.
 */
export interface RunEvent {
  /** Schema version for this document. */
  readonly schemaVersion: 'cli-core.run-event.v1';
  /** Correlation identifier for this run. */
  readonly runId: RunIdentifier;
  /** Monotonic event sequence number. */
  readonly sequence: number;
  /** Lifecycle event name in chronological run order. */
  readonly name: RunEventName;
  /** Event-specific structured data. */
  readonly payload: RunPayload;
}

/**
 * Stable run event names.
 */
export type RunEventName =
  | 'parse.completed'
  | 'config.resolved'
  | 'validation.completed'
  | 'run.started'
  | 'run.planned'
  | 'run.applied'
  | 'run.skipped'
  | 'effects.planned'
  | 'run.failed'
  | 'plugin.hooks.planned'
  | 'plugin.hooks.completed'
  | 'run.completed';

/**
 * Effect envelope produced or planned by a run.
 */
export type RunEffect = SpawnRunEffect | FileRunEffect | PluginRunEffect | CustomRunEffect;

/**
 * Structured spawn effect; shell interpolation is not implied.
 */
export interface SpawnRunEffect {
  /** Effect category used by policy and adapters. */
  readonly kind: 'spawn';
  /** Executable name or path; shell interpolation is not implied. */
  readonly command: string;
  /** Arguments passed as structured tokens to the host adapter. */
  readonly argv: readonly string[];
  /** Working directory when one is provided. */
  readonly cwd?: string;
  /** Environment overrides passed to the host adapter. */
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * Structured file effect that requires an explicit adapter to apply.
 */
export interface FileRunEffect {
  /** File operation requested from an explicit adapter. */
  readonly kind: 'write_file' | 'delete_path';
  /** Filesystem path targeted by the file effect. */
  readonly path: string;
  /** Content to write when the action needs it. */
  readonly content?: string;
}

/**
 * Effect emitted from a plugin hook.
 */
export interface PluginRunEffect {
  /** Effect category used to preserve plugin-originated effects. */
  readonly kind: 'plugin';
  /** Plugin that emitted the effect. */
  readonly pluginName: string;
  /** Name of the plugin hook. */
  readonly hookName: string;
  /** Plugin hook event. */
  readonly event: CliPluginHookEvent;
  /** Plugin-specific effect kind. */
  readonly effectKind: string;
  /** Plugin-defined structured effect data. */
  readonly payload?: RunPayload;
}

/**
 * Custom effect envelope for adapters that understand it.
 */
export interface CustomRunEffect {
  /** Effect category for custom adapters. */
  readonly kind: 'custom';
  /** Adapter-specific effect name. */
  readonly name: string;
  /** Adapter-specific structured effect data. */
  readonly payload?: RunPayload;
}

/**
 * Artifact emitted or planned by a command handler.
 */
export interface RunArtifact {
  /** Artifact identifier chosen by the handler or plugin. */
  readonly id: string;
  /** Artifact category understood by downstream consumers. */
  readonly kind: string;
  /** Human-facing label for rendered output. */
  readonly label?: string;
  /** Artifact data retained for machine consumers. */
  readonly payload: RunPayload;
}

/**
 * Exit status override map keyed by exit kind.
 */
export type ExitStatusPolicy = Partial<Record<ExitKind, number>>;

/**
 * Plans or applies a parsed command invocation.
 *
 * @remarks
 * The result is the truth surface: events, effects, artifacts, diagnostics, and exit status are returned as data.
 */
export async function runCli(program: CliProgram, request: RunRequest): Promise<RunResult> {
  const mode = request.mode ?? 'plan';
  const invocation = request.invocation ?? parseCli(program, { argv: request.argv ?? [] });
  const runId = request.runId ?? createRunIdentifier(program, invocation, mode);
  const diagnostics: CliDiagnostic[] = [
    ...invocation.diagnostics,
    ...(request.config?.diagnostics ?? []),
    ...(request.validation?.diagnostics ?? []),
    ...effectDiagnostics(request.effects ?? [])
  ];
  const events = new RunEventRecorder(runId, request.eventSink, diagnostics);
  const effects = [...(request.effects ?? [])].map((effect) => freezeRunValue(effect));
  const artifacts = [...(request.artifacts ?? [])].map((artifact) => freezeRunValue(artifact));

  events.record('parse.completed', {
    ok: invocation.ok,
    commandPath: invocation.commandPath,
    diagnostics: invocation.diagnostics.length
  });
  if (request.config !== undefined) {
    events.record('config.resolved', {
      ok: request.config.ok,
      version: request.config.version ?? '',
      diagnostics: request.config.diagnostics.length
    });
  }
  if (request.validation !== undefined) {
    events.record('validation.completed', {
      ok: request.validation.ok,
      diagnostics: request.validation.diagnostics.length
    });
  }

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
    events.record('run.skipped', { reason: 'parse_error' });
    await runPluginLifecycle('finally', request, invocation, events, effects, diagnostics);
    return finishRun({
      runId,
      mode,
      invocation,
      exitKind: 'parse_error',
      explicitExitStatus: undefined,
      diagnostics,
      effects,
      artifacts,
      events,
      policy: request.exitStatusPolicy,
      redaction: request.redaction
    });
  }

  const requestFailureKind = requestInputFailureKind(request);
  if (requestFailureKind !== undefined) {
    events.record('run.skipped', { reason: requestFailureKind });
    await runPluginLifecycle('finally', request, invocation, events, effects, diagnostics);
    return finishRun({
      runId,
      mode,
      invocation,
      exitKind: requestFailureKind,
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
  events.record('effects.planned', {
    effects: effects.length
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
  const exitStatus = input.explicitExitStatus ?? exitStatusFor(input.exitKind, input.policy);
  if (input.exitKind !== 'ok') {
    input.events.record('run.failed', {
      exitKind: input.exitKind,
      exitStatus,
      diagnostics: input.diagnostics.length
    });
  }
  input.events.record('run.completed', {
    exitKind: input.exitKind,
    exitStatus
  });
  const diagnostics = redactCliDiagnostics(input.diagnostics, input.redaction);
  const invocation = redactCliSecrets(input.invocation, input.redaction) as ParsedInvocation;
  const events = Object.freeze(input.events.snapshot().map((event) => redactCliSecrets(event, input.redaction) as RunEvent));
  const effects = Object.freeze(input.effects.map((effect) => redactCliSecrets(effect, input.redaction) as RunEffect));
  const artifacts = Object.freeze(input.artifacts.map((artifact) => redactCliSecrets(artifact, input.redaction) as RunArtifact));

  return Object.freeze({
    schemaVersion: 'cli-core.run-result.v1',
    runId: input.runId,
    mode: input.mode,
    invocation,
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

function requestInputFailureKind(request: RunRequest): ExitKind | undefined {
  if (request.config !== undefined && !request.config.ok) return 'config_error';
  if (request.validation !== undefined && !request.validation.ok) return 'validation_error';
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
  return policyStatusFor(kind, policy) ?? defaultExitStatusFor(kind);
}

function policyStatusFor(kind: ExitKind, policy: ExitStatusPolicy | undefined): number | undefined {
  if (policy === undefined) return undefined;
  if (kind === 'ok') return policy.ok;
  if (kind === 'parse_error') return policy.parse_error;
  if (kind === 'config_error') return policy.config_error;
  if (kind === 'validation_error') return policy.validation_error;
  if (kind === 'policy_denied') return policy.policy_denied;
  if (kind === 'cancelled') return policy.cancelled;
  if (kind === 'interrupted') return policy.interrupted;
  if (kind === 'timeout') return policy.timeout;
  if (kind === 'external_error') return policy.external_error;
  return policy.internal_error;
}

function defaultExitStatusFor(kind: ExitKind): number {
  if (kind === 'ok') return 0;
  if (kind === 'parse_error') return 2;
  if (kind === 'config_error') return 78;
  if (kind === 'validation_error') return 3;
  if (kind === 'policy_denied') return 3;
  if (kind === 'cancelled' || kind === 'interrupted') return 130;
  if (kind === 'timeout') return 124;
  return 1;
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
  readonly #sink: RunEventSink | undefined;
  readonly #diagnostics: CliDiagnostic[];
  readonly #events: RunEvent[] = [];

  public constructor(runId: RunIdentifier, sink: RunEventSink | undefined, diagnostics: CliDiagnostic[]) {
    this.#runId = runId;
    this.#sink = sink;
    this.#diagnostics = diagnostics;
  }

  public record(name: RunEventName, payload: RunPayload): void {
    const event = Object.freeze({
      schemaVersion: 'cli-core.run-event.v1',
      runId: this.#runId,
      sequence: this.#events.length,
      name,
      payload: freezeRunValue(payload)
    });
    this.#events.push(event);
    try {
      this.#sink?.(event);
    } catch (error) {
      this.#diagnostics.push(createCliDiagnostic('CLI_RUN_EVENT_SINK_FAILED', 'warning', 'Run event sink failed.', {
        eventName: name,
        errorMessage: errorMessage(error)
      }));
    }
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
