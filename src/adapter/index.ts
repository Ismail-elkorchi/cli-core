import type { CliProgram } from '../command/index.js';
import {
  applyCliEffects,
  planCliEffects,
  type CliEffectHost,
  type EffectApplicationRequest,
  type EffectApplicationPolicy,
  type EffectApplicationReport
} from '../effects/index.js';
import type { CliPluginHost } from '../plugins/index.js';
import {
  runCli,
  type ExitStatusPolicy,
  type RunArtifact,
  type RunPayload,
  type RunEffect,
  type RunHandler,
  type RunMode,
  type RunResult
} from '../run/index.js';
import { redactCliDiagnostics, redactCliSecrets, type CliRedactionOptions } from '../schema/index.js';

export type CliMainEffectMode = 'none' | 'plan' | 'apply';

export type CliTextWriter = (text: string) => void | Promise<void>;

export interface CliMainHost {
  readonly argv?: readonly string[];
  readonly writeStdout?: CliTextWriter;
  readonly writeStderr?: CliTextWriter;
  readonly setExitCode?: (status: number) => void | Promise<void>;
}

export interface CliMainRequest {
  readonly program: CliProgram;
  readonly argv?: readonly string[];
  readonly mode?: RunMode;
  readonly handlers?: Readonly<Record<string, RunHandler>>;
  readonly effects?: readonly RunEffect[];
  readonly artifacts?: readonly RunArtifact[];
  readonly context?: RunPayload;
  readonly pluginHost?: CliPluginHost;
  readonly pluginContext?: RunPayload;
  readonly exitStatusPolicy?: ExitStatusPolicy;
  readonly redaction?: CliRedactionOptions;
  readonly effectMode?: CliMainEffectMode;
  readonly effectHost?: CliEffectHost;
  readonly effectPolicy?: EffectApplicationPolicy;
  readonly render?: CliMainRenderer;
}

export type CliMainRenderer = (run: RunResult, effectReport: EffectApplicationReport | undefined) => CliMainText;

export interface CliMainText {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitStatus: number;
}

export interface CliMainResult {
  readonly run: RunResult;
  readonly effectReport?: EffectApplicationReport;
  readonly rendered: CliMainText;
  readonly exitStatus: number;
}

export type CliMain = (host?: CliMainHost) => Promise<CliMainResult>;

export interface NodeCliProcessLike {
  readonly argv: readonly string[];
  readonly stdout: CliWritableStream;
  readonly stderr: CliWritableStream;
  exitCode?: number | string | null | undefined;
}

export interface CliWritableStream {
  readonly write: (chunk: string) => unknown;
}

export function createCliMain(request: CliMainRequest): CliMain {
  return (host: CliMainHost = {}) => runCliMain(request, host);
}

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

async function runEffectsForMain(
  request: CliMainRequest,
  run: RunResult
): Promise<EffectApplicationReport | undefined> {
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
