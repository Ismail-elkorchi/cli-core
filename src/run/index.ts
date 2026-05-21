import type { CliCommand, CliProgram } from '../command/index.js';
import {
  createCliDiagnostic,
  hasErrorDiagnostics,
  type CliDiagnostic,
  type CliDiagnosticValue
} from '../diagnostics.js';
import { cliCorePackage } from '../package.js';
import { parseCli, type ParsedInvocation } from '../parse/index.js';

export { cliCorePackage };
export type { CliCorePackage } from '../package.js';

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

export type RunData = CliDiagnosticValue;

export interface RunRequest {
  readonly mode?: RunMode;
  readonly runId?: RunIdentifier;
  readonly argv?: readonly string[];
  readonly invocation?: ParsedInvocation;
  readonly handlers?: Readonly<Record<string, RunHandler>>;
  readonly effects?: readonly RunEffect[];
  readonly artifacts?: readonly RunArtifact[];
  readonly context?: RunData;
  readonly exitStatusPolicy?: ExitStatusPolicy;
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
  readonly context: RunData;
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
  readonly data: RunData;
}

export type RunEventName =
  | 'run.started'
  | 'run.planned'
  | 'run.applied'
  | 'run.skipped'
  | 'run.completed';

export type RunEffect = SpawnRunEffect | FileRunEffect | CustomRunEffect;

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

export interface CustomRunEffect {
  readonly kind: 'custom';
  readonly name: string;
  readonly data?: RunData;
}

export interface RunArtifact {
  readonly id: string;
  readonly kind: string;
  readonly label?: string;
  readonly data: RunData;
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
  const plannedEffects = Object.freeze([...(request.effects ?? [])].map((effect) => freezeRunValue(effect)));
  const plannedArtifacts = Object.freeze([...(request.artifacts ?? [])].map((artifact) => freezeRunValue(artifact)));

  events.record('run.started', {
    mode,
    commandPath: invocation.commandPath,
    argv: invocation.argv
  });

  const interrupted = interruptionResult(request, invocation.commandPath);
  if (interrupted !== undefined) {
    diagnostics.push(interrupted.diagnostic);
    events.record('run.skipped', { reason: interrupted.exitKind });
    return finishRun({
      runId,
      mode,
      invocation,
      exitKind: interrupted.exitKind,
      explicitExitStatus: undefined,
      diagnostics,
      effects: plannedEffects,
      artifacts: plannedArtifacts,
      events,
      policy: request.exitStatusPolicy
    });
  }

  if (!invocation.ok) {
    events.record('run.skipped', { reason: 'usage' });
    return finishRun({
      runId,
      mode,
      invocation,
      exitKind: 'usage',
      explicitExitStatus: undefined,
      diagnostics,
      effects: plannedEffects,
      artifacts: plannedArtifacts,
      events,
      policy: request.exitStatusPolicy
    });
  }

  events.record('run.planned', {
    effects: plannedEffects.length,
    artifacts: plannedArtifacts.length
  });

  if (mode === 'plan') {
    return finishRun({
      runId,
      mode,
      invocation,
      exitKind: hasErrorDiagnostics(diagnostics) ? 'policy_denied' : 'ok',
      explicitExitStatus: undefined,
      diagnostics,
      effects: plannedEffects,
      artifacts: plannedArtifacts,
      events,
      policy: request.exitStatusPolicy
    });
  }

  const command = invocation.command ?? program.root;
  const handler = findRunHandler(command, request.handlers);
  if (handler === undefined) {
    diagnostics.push(createCliDiagnostic('CLI_RUN_HANDLER_MISSING', 'error', 'No run handler is registered for the matched command.', {
      commandPath: invocation.commandPath
    }));
    events.record('run.skipped', { reason: 'missing_handler' });
    return finishRun({
      runId,
      mode,
      invocation,
      exitKind: 'policy_denied',
      explicitExitStatus: undefined,
      diagnostics,
      effects: plannedEffects,
      artifacts: plannedArtifacts,
      events,
      policy: request.exitStatusPolicy
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
    const appliedEffects = Object.freeze([
      ...plannedEffects,
      ...(output.effects ?? []).map((effect) => freezeRunValue(effect))
    ]);
    const artifacts = Object.freeze([
      ...plannedArtifacts,
      ...(output.artifacts ?? []).map((artifact) => freezeRunValue(artifact))
    ]);
    diagnostics.push(...(output.diagnostics ?? []), ...effectDiagnostics(output.effects ?? []));
    events.record('run.applied', {
      effects: appliedEffects.length,
      artifacts: artifacts.length
    });

    return finishRun({
      runId,
      mode,
      invocation,
      exitKind: output.exitKind ?? (hasErrorDiagnostics(diagnostics) ? 'external_error' : 'ok'),
      explicitExitStatus: output.exitStatus,
      diagnostics,
      effects: appliedEffects,
      artifacts,
      events,
      policy: request.exitStatusPolicy
    });
  } catch (error) {
    diagnostics.push(createCliDiagnostic('CLI_RUN_HANDLER_FAILED', 'error', 'Run handler failed.', {
      commandPath: invocation.commandPath,
      errorMessage: errorMessage(error)
    }));
    events.record('run.skipped', { reason: 'handler_failed' });
    return finishRun({
      runId,
      mode,
      invocation,
      exitKind: 'external_error',
      explicitExitStatus: undefined,
      diagnostics,
      effects: plannedEffects,
      artifacts: plannedArtifacts,
      events,
      policy: request.exitStatusPolicy
    });
  }
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
}

function finishRun(input: FinishRunInput): RunResult {
  const diagnostics = Object.freeze([...input.diagnostics]);
  const exitStatus = input.explicitExitStatus ?? exitStatusFor(input.exitKind, input.policy);
  input.events.record('run.completed', {
    exitKind: input.exitKind,
    exitStatus
  });

  return Object.freeze({
    schemaVersion: 'cli-core.run-result.v1',
    runId: input.runId,
    mode: input.mode,
    invocation: input.invocation,
    ok: input.exitKind === 'ok' && !hasErrorDiagnostics(diagnostics),
    exitKind: input.exitKind,
    exitStatus,
    events: input.events.snapshot(),
    effects: Object.freeze([...input.effects]),
    artifacts: Object.freeze([...input.artifacts]),
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

  public record(name: RunEventName, data: RunData): void {
    this.#events.push(Object.freeze({
      schemaVersion: 'cli-core.run-event.v1',
      runId: this.#runId,
      sequence: this.#events.length,
      name,
      data: freezeRunValue(data)
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
