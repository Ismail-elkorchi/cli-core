import type { CliProgram } from '../command/index.ts';
import {
  applyCliEffects,
  planCliEffects,
  type CliEffectHost,
  type EffectApplicationRequest,
  type EffectApplicationPolicy,
  type EffectApplicationReport
} from '../effects/index.ts';
import type { CliPluginHost } from '../plugins/index.ts';
import {
  runCli,
  type ExitStatusPolicy,
  type RunArtifact,
  type RunPayload,
  type RunEffect,
  type RunHandler,
  type RunMode,
  type RunResult
} from '../run/index.ts';
import { redactCliDiagnostics, redactCliSecrets, type CliRedactionOptions } from '../schema/index.ts';

/**
 * Effect mode used by CLI adapter helpers.
 */
export type CliMainEffectMode = 'none' | 'plan' | 'apply';

/**
 * Writer function supplied by an explicit CLI host.
 */
export type CliTextWriter = (text: string) => void | Promise<void>;

/**
 * Explicit host boundary for argv, output, and exit status.
 */
export interface CliMainHost {
  /** Tokens supplied by the host after executable and binary names are removed. */
  readonly argv?: readonly string[];
  /** Explicit stdout writer supplied by the host. */
  readonly writeStdout?: CliTextWriter;
  /** Explicit stderr writer supplied by the host. */
  readonly writeStderr?: CliTextWriter;
  /** Explicit exit status setter supplied by the host. */
  readonly setExitCode?: (status: number) => void | Promise<void>;
}

/**
 * Request used to build a reusable CLI main function.
 */
export interface CliMainRequest {
  /** CLI program for this operation. */
  readonly program: CliProgram;
  /** Default argv tokens used when the host does not supply argv. */
  readonly argv?: readonly string[];
  /** Run mode forwarded to runCli. */
  readonly mode?: RunMode;
  /** Run handlers keyed by command id, path, or name. */
  readonly handlers?: Readonly<Record<string, RunHandler>>;
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
  /** How the adapter handles run effects. */
  readonly effectMode?: CliMainEffectMode;
  /** Host used to apply effects explicitly. */
  readonly effectHost?: CliEffectHost;
  /** Policy used to authorize explicit effect application. */
  readonly effectPolicy?: EffectApplicationPolicy;
  /** Renderer used to convert run data into text. */
  readonly render?: CliMainRenderer;
}

/**
 * Renderer that converts structured run data into text.
 */
export type CliMainRenderer = (run: RunResult, effectReport: EffectApplicationReport | undefined) => CliMainText;

/**
 * Rendered stdout, stderr, and exit status.
 */
export interface CliMainText {
  /** Text intended for stdout. */
  readonly stdout: string;
  /** Text intended for stderr. */
  readonly stderr: string;
  /** Process-style numeric exit status. */
  readonly exitStatus: number;
}

/**
 * Result returned by a CLI main adapter.
 */
export interface CliMainResult {
  /** Structured run result returned by runCli. */
  readonly run: RunResult;
  /** Effect application report when effects were processed. */
  readonly effectReport?: EffectApplicationReport;
  /** Rendered text and exit status. */
  readonly rendered: CliMainText;
  /** Process-style numeric exit status. */
  readonly exitStatus: number;
}

/**
 * Reusable CLI entrypoint function.
 */
export type CliMain = (host?: CliMainHost) => Promise<CliMainResult>;

/**
 * Process-like object accepted by the Node CLI adapter.
 */
export interface NodeCliProcessLike {
  /** Process argv including executable and script entries. */
  readonly argv: readonly string[];
  /** Stream used only by the explicit adapter boundary. */
  readonly stdout: CliWritableStream;
  /** Error stream used only by the explicit adapter boundary. */
  readonly stderr: CliWritableStream;
  /** Mutable exit code field on the process-like host. */
  exitCode?: number | string | null | undefined;
}

/**
 * Minimal writable stream shape used by the adapter.
 */
export interface CliWritableStream {
  /** Writes a string chunk to the stream. */
  readonly write: (chunk: string) => unknown;
}

/**
 * Creates a reusable CLI main function from a request.
 *
 * @example
 * ```ts
 * import { defineCli } from '@ismail-elkorchi/cli-core';
 * import { createCliMain } from '@ismail-elkorchi/cli-core/adapter';
 *
 * const program = defineCli({ name: 'ship', commands: [{ name: 'status' }] });
 * const main = createCliMain({
 *   program,
 *   mode: 'apply',
 *   handlers: { status: () => ({ artifacts: [{ id: 'status', kind: 'text', payload: 'ok' }] }) }
 * });
 *
 * const stdout: string[] = [];
 * const stderr: string[] = [];
 * let exitCode: number | undefined;
 * await main({
 *   argv: ['status'],
 *   writeStdout: (text) => stdout.push(text),
 *   writeStderr: (text) => stderr.push(text),
 *   setExitCode: (status) => { exitCode = status; }
 * });
 * ```
 */
export function createCliMain(request: CliMainRequest): CliMain {
  return (host: CliMainHost = {}) => runCliMain(request, host);
}

/**
 * Runs the CLI adapter through an explicit host.
 */
export async function runCliMain(request: CliMainRequest, host: CliMainHost = {}): Promise<CliMainResult> {
  const runRequest = buildRunRequest(request, host);
  const effectMode = request.effectMode ?? 'none';
  const rawRun = await runCli(request.program, effectMode === 'none'
    ? runRequest
    : { ...runRequest, redaction: { enabled: false } });
  const effectReport = await runEffectsForMain(request, rawRun);
  const run = effectMode === 'none' ? rawRun : redactRunResult(rawRun, request.redaction);
  const rendered = (request.render ?? renderRunResultText)(run, effectReport);

  if (rendered.stdout.length > 0) await host.writeStdout?.(rendered.stdout);
  if (rendered.stderr.length > 0) await host.writeStderr?.(rendered.stderr);
  await host.setExitCode?.(rendered.exitStatus);

  const optionalFields: { effectReport?: EffectApplicationReport } = {};
  if (effectReport !== undefined) optionalFields.effectReport = effectReport;
  return Object.freeze({
    run,
    ...optionalFields,
    rendered,
    exitStatus: rendered.exitStatus
  });
}

/**
 * Renders a structured run result into stdout, stderr, and exit status text.
 */
export function renderRunResultText(
  run: RunResult,
  effectReport: EffectApplicationReport | undefined = undefined
): CliMainText {
  const effectStatus = effectReport === undefined ? undefined : (effectReport.ok ? 'ok' : 'failed');
  const exitStatus = effectReport !== undefined && !effectReport.ok && run.exitStatus === 0 ? 3 : run.exitStatus;
  const commandPath = run.invocation.commandPath.length === 0 ? '(root)' : run.invocation.commandPath.join(' ');
  const summary = [
    `${run.mode} ${run.runId}`,
    `command ${commandPath}`,
    `exit ${run.exitKind} ${exitStatus}`,
    `effects ${run.effects.length}`,
    `artifacts ${run.artifacts.length}`
  ];
  if (effectStatus !== undefined) summary.push(`effectApplication ${effectStatus}`);

  const diagnostics = [
    ...run.diagnostics.map((diagnostic) => `[${diagnostic.code}] ${diagnostic.message}`),
    ...(effectReport?.diagnostics.map((diagnostic) => `[${diagnostic.code}] ${diagnostic.message}`) ?? [])
  ];
  const stdout = run.ok && (effectReport?.ok ?? true) ? `${summary.join('\n')}\n` : '';
  const stderr = diagnostics.length === 0 && stdout.length === 0
    ? `${summary.join('\n')}\n`
    : diagnostics.length === 0
      ? ''
      : `${[...summary, ...diagnostics].join('\n')}\n`;

  return Object.freeze({ stdout, stderr, exitStatus });
}

/**
 * Creates a CLI host from a process-like object.
 */
export function createNodeCliAdapter(processLike: NodeCliProcessLike): CliMainHost {
  return Object.freeze({
    argv: Object.freeze(processLike.argv.slice(2)),
    writeStdout(text: string): void {
      processLike.stdout.write(text);
    },
    writeStderr(text: string): void {
      processLike.stderr.write(text);
    },
    setExitCode(status: number): void {
      processLike.exitCode = status;
    }
  });
}

function buildRunRequest(request: CliMainRequest, host: CliMainHost) {
  const runRequest: {
    mode: RunMode;
    argv: readonly string[];
    handlers?: Readonly<Record<string, RunHandler>>;
    effects?: readonly RunEffect[];
    artifacts?: readonly RunArtifact[];
    context?: RunPayload;
    pluginHost?: CliPluginHost;
    pluginContext?: RunPayload;
    exitStatusPolicy?: ExitStatusPolicy;
    redaction?: CliRedactionOptions;
  } = {
    mode: request.mode ?? 'apply',
    argv: Object.freeze([...(request.argv ?? host.argv ?? [])])
  };
  if (request.handlers !== undefined) runRequest.handlers = request.handlers;
  if (request.effects !== undefined) runRequest.effects = request.effects;
  if (request.artifacts !== undefined) runRequest.artifacts = request.artifacts;
  if (request.context !== undefined) runRequest.context = request.context;
  if (request.pluginHost !== undefined) runRequest.pluginHost = request.pluginHost;
  if (request.pluginContext !== undefined) runRequest.pluginContext = request.pluginContext;
  if (request.exitStatusPolicy !== undefined) runRequest.exitStatusPolicy = request.exitStatusPolicy;
  if (request.redaction !== undefined) runRequest.redaction = request.redaction;
  return runRequest;
}

function runEffectsForMain(
  request: CliMainRequest,
  run: RunResult
): EffectApplicationReport | Promise<EffectApplicationReport> | undefined {
  const effectMode = request.effectMode ?? 'none';
  if (effectMode === 'none') return undefined;
  if (effectMode === 'plan') return planCliEffects(run.effects, request.redaction);
  const applicationRequest: EffectApplicationRequest = {
    effects: run.effects,
    ...(request.effectHost !== undefined ? { host: request.effectHost } : {}),
    ...(request.effectPolicy !== undefined ? { policy: request.effectPolicy } : {}),
    ...(request.redaction !== undefined ? { redaction: request.redaction } : {})
  };
  return applyCliEffects(applicationRequest);
}

function redactRunResult(run: RunResult, redaction: CliRedactionOptions | undefined): RunResult {
  return Object.freeze({
    ...run,
    events: Object.freeze(run.events.map((event) => redactCliSecrets(event, redaction) as RunResult['events'][number])),
    effects: Object.freeze(run.effects.map((effect) => redactCliSecrets(effect, redaction) as RunEffect)),
    artifacts: Object.freeze(run.artifacts.map((artifact) => redactCliSecrets(artifact, redaction) as RunArtifact)),
    diagnostics: redactCliDiagnostics(run.diagnostics, redaction)
  });
}
