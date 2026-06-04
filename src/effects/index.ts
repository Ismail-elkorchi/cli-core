import {
  createCliDiagnostic,
  hasErrorDiagnostics,
  type CliDiagnostic,
  type CliDiagnosticValue
} from '../diagnostics.ts';
import type { FileRunEffect, RunEffect, RunPayload, SpawnRunEffect } from '../run/index.ts';
import { redactCliDiagnostics, redactCliSecrets, type CliRedactionOptions } from '../schema/index.ts';

/**
 * Effect application mode used by effect adapters.
 */
export type EffectApplicationMode = 'plan' | 'apply';

/**
 * Policy that authorizes effect application by kind.
 */
export interface EffectApplicationPolicy {
  /** Whether spawn effects may be applied. */
  readonly allowSpawn?: boolean;
  /** Whether file write effects may be applied. */
  readonly allowWriteFile?: boolean;
  /** Whether delete path effects may be applied. */
  readonly allowDeletePath?: boolean;
  /** Whether custom effects may be applied. */
  readonly allowCustom?: boolean;
}

/**
 * Explicit request for planning or applying run effects.
 */
export interface EffectApplicationRequest {
  /** Selects planning-only reporting or host-backed application. */
  readonly mode?: EffectApplicationMode;
  /** Effects to plan or apply in the given order. */
  readonly effects: readonly RunEffect[];
  /** Explicit host adapter used by this operation. */
  readonly host?: CliEffectHost;
  /** Policy that authorizes effect application. */
  readonly policy?: EffectApplicationPolicy;
  /** Redaction options applied to returned data. */
  readonly redaction?: CliRedactionOptions;
}

/**
 * Host adapter that performs effects only when policy allows them.
 */
export interface CliEffectHost {
  /** Applies a structured spawn effect. */
  readonly applySpawn?: (effect: SpawnRunEffect) => EffectHostResult | Promise<EffectHostResult>;
  /** Applies a structured file-write effect. */
  readonly writeFile?: (effect: FileRunEffect) => EffectHostResult | Promise<EffectHostResult>;
  /** Applies a structured delete-path effect. */
  readonly deletePath?: (effect: FileRunEffect) => EffectHostResult | Promise<EffectHostResult>;
  /** Applies a custom effect envelope. */
  readonly applyCustom?: (effect: RunEffect) => EffectHostResult | Promise<EffectHostResult>;
}

/**
 * Result returned by an effect host operation.
 */
export interface EffectHostResult {
  /** Marks a host operation as failed even when it did not throw. */
  readonly ok?: boolean;
  /** Host-specific result data included in the item report. */
  readonly payload?: RunPayload;
  /** Host diagnostics folded into the item and aggregate reports. */
  readonly diagnostics?: readonly CliDiagnostic[];
}

/**
 * Report returned after effect planning or application.
 */
export interface EffectApplicationReport {
  /** Schema version for this document. */
  readonly schemaVersion: 'cli-core.effect-application.v1';
  /** Mode used for every item in this report. */
  readonly mode: EffectApplicationMode;
  /** False when any item was denied, failed, or emitted error diagnostics. */
  readonly ok: boolean;
  /** Per-item application reports. */
  readonly reports: readonly EffectApplicationItemReport[];
  /** Aggregate diagnostics from policy checks and host operations. */
  readonly diagnostics: readonly CliDiagnostic[];
}

/**
 * Per-effect planning or application report.
 */
export interface EffectApplicationItemReport {
  /** Effect associated with this application report. */
  readonly effect: RunEffect;
  /** Policy or host outcome for this effect. */
  readonly status: 'planned' | 'applied' | 'denied' | 'failed';
  /** Host result data after redaction. */
  readonly payload: RunPayload;
  /** Diagnostics specific to this effect. */
  readonly diagnostics: readonly CliDiagnostic[];
}

/**
 * In-memory effect host for tests and examples.
 */
export interface MemoryEffectHost {
  /** Explicit host adapter used by this operation. */
  readonly host: CliEffectHost;
  /** Returns file writes currently recorded by the host. */
  readonly files: () => Readonly<Record<string, string>>;
  /** Returns spawn requests currently recorded by the host. */
  readonly spawns: () => readonly MemorySpawnRecord[];
}

/**
 * Spawn effect captured by the memory effect host.
 */
export interface MemorySpawnRecord {
  /** Executable requested by the spawn effect. */
  readonly command: string;
  /** Structured spawn arguments recorded without shell parsing. */
  readonly argv: readonly string[];
  /** Working directory when one is provided. */
  readonly cwd: string | undefined;
  /** Environment overrides recorded for this spawn. */
  readonly env: Readonly<Record<string, string>> | undefined;
}

/**
 * Returns a report for effects without applying a host.
 */
export function planCliEffects(effects: readonly RunEffect[], redaction?: CliRedactionOptions): EffectApplicationReport {
  return finishEffectReport({
    mode: 'plan',
    reports: effects.map((effect) => itemReport(effect, 'planned', null, [])),
    diagnostics: [],
    redaction
  });
}

/**
 * Applies run effects through an explicit host and policy.
 */
export async function applyCliEffects(request: EffectApplicationRequest): Promise<EffectApplicationReport> {
  if ((request.mode ?? 'apply') === 'plan') {
    return planCliEffects(request.effects, request.redaction);
  }

  const reports: EffectApplicationItemReport[] = [];
  const diagnostics: CliDiagnostic[] = [];
  for (const effect of request.effects) {
    const denial = effectDenial(effect, request);
    if (denial !== undefined) {
      diagnostics.push(denial);
      reports.push(itemReport(effect, 'denied', null, [denial]));
      continue;
    }

    try {
      const result = await applyOneEffect(effect, request.host as CliEffectHost);
      const itemDiagnostics = Object.freeze([...(result.diagnostics ?? [])]);
      diagnostics.push(...itemDiagnostics);
      reports.push(itemReport(effect, result.ok === false || hasErrorDiagnostics(itemDiagnostics) ? 'failed' : 'applied', result.payload ?? null, itemDiagnostics));
    } catch (error) {
      const diagnostic = effectDiagnostic('CLI_EFFECT_APPLY_FAILED', 'Effect host failed while applying an effect.', {
        effectKind: effect.kind,
        errorMessage: errorMessage(error)
      });
      diagnostics.push(diagnostic);
      reports.push(itemReport(effect, 'failed', null, [diagnostic]));
    }
  }

  return finishEffectReport({ mode: 'apply', reports, diagnostics, redaction: request.redaction });
}

/**
 * Creates an in-memory effect host for tests and examples.
 */
export function createMemoryEffectHost(): MemoryEffectHost {
  const files = new Map<string, string>();
  const spawns: MemorySpawnRecord[] = [];
  const host: CliEffectHost = Object.freeze({
    applySpawn(effect: SpawnRunEffect): EffectHostResult {
      spawns.push(Object.freeze({
        command: effect.command,
        argv: Object.freeze([...effect.argv]),
        cwd: effect.cwd,
        env: effect.env === undefined ? undefined : Object.freeze({ ...effect.env })
      }));
      return { payload: { command: effect.command, argv: effect.argv, exitStatus: 0 } };
    },
    writeFile(effect: FileRunEffect): EffectHostResult {
      files.set(effect.path, effect.content ?? '');
      return { payload: { path: effect.path, bytes: (effect.content ?? '').length } };
    },
    deletePath(effect: FileRunEffect): EffectHostResult {
      files.delete(effect.path);
      return { payload: { path: effect.path, deleted: true } };
    },
    applyCustom(effect: RunEffect): EffectHostResult {
      return { payload: { effectKind: effect.kind } };
    }
  });

  return Object.freeze({
    host,
    files(): Readonly<Record<string, string>> {
      return Object.freeze(Object.fromEntries(files));
    },
    spawns(): readonly MemorySpawnRecord[] {
      return Object.freeze(spawns.map((spawn) => Object.freeze({
        ...spawn,
        argv: Object.freeze([...spawn.argv]),
        env: spawn.env === undefined ? undefined : Object.freeze({ ...spawn.env })
      })));
    }
  });
}

interface FinishEffectReportInput {
  readonly mode: EffectApplicationMode;
  readonly reports: readonly EffectApplicationItemReport[];
  readonly diagnostics: readonly CliDiagnostic[];
  readonly redaction: CliRedactionOptions | undefined;
}

function finishEffectReport(input: FinishEffectReportInput): EffectApplicationReport {
  const diagnostics = redactCliDiagnostics(input.diagnostics, input.redaction);
  const reports = input.reports.map((report) => redactCliSecrets(report, input.redaction) as EffectApplicationItemReport);
  return Object.freeze({
    schemaVersion: 'cli-core.effect-application.v1',
    mode: input.mode,
    ok: !hasErrorDiagnostics(diagnostics) && reports.every((report) => report.status === 'planned' || report.status === 'applied'),
    reports: Object.freeze(reports),
    diagnostics
  });
}

function effectDenial(effect: RunEffect, request: EffectApplicationRequest): CliDiagnostic | undefined {
  if (request.host === undefined) {
    return effectDiagnostic('CLI_EFFECT_HOST_MISSING', 'Effect application requires an explicit host.', { effectKind: effect.kind });
  }
  if (request.policy === undefined) {
    return effectDiagnostic('CLI_EFFECT_DENIED', 'Effect application requires an explicit policy.', { effectKind: effect.kind });
  }
  if (effect.kind === 'spawn') {
    if (request.policy.allowSpawn !== true || request.host.applySpawn === undefined) {
      return effectDiagnostic('CLI_EFFECT_DENIED', 'Spawn effect is not allowed by the effect policy or host.', { effectKind: effect.kind });
    }
    return undefined;
  }
  if (effect.kind === 'write_file') {
    if (request.policy.allowWriteFile !== true || request.host.writeFile === undefined) {
      return effectDiagnostic('CLI_EFFECT_DENIED', 'File write effect is not allowed by the effect policy or host.', { effectKind: effect.kind, path: effect.path });
    }
    return undefined;
  }
  if (effect.kind === 'delete_path') {
    if (request.policy.allowDeletePath !== true || request.host.deletePath === undefined) {
      return effectDiagnostic('CLI_EFFECT_DENIED', 'Delete path effect is not allowed by the effect policy or host.', { effectKind: effect.kind, path: effect.path });
    }
    return undefined;
  }
  if (request.policy.allowCustom !== true || request.host.applyCustom === undefined) {
    return effectDiagnostic('CLI_EFFECT_DENIED', 'Custom effect is not allowed by the effect policy or host.', { effectKind: effect.kind });
  }
  return undefined;
}

function applyOneEffect(effect: RunEffect, host: CliEffectHost): EffectHostResult | Promise<EffectHostResult> {
  // effectDenial is the policy gate for this internal call; a missing method
  // is reported as a denial before control reaches this dispatcher.
  if (effect.kind === 'spawn') return host.applySpawn!(effect);
  if (effect.kind === 'write_file') return host.writeFile!(effect);
  if (effect.kind === 'delete_path') return host.deletePath!(effect);
  return host.applyCustom!(effect);
}

function itemReport(
  effect: RunEffect,
  status: EffectApplicationItemReport['status'],
  payload: RunPayload,
  diagnostics: readonly CliDiagnostic[]
): EffectApplicationItemReport {
  return Object.freeze({
    effect,
    status,
    payload,
    diagnostics: Object.freeze([...diagnostics])
  });
}

function effectDiagnostic(
  code: CliDiagnostic['code'],
  message: string,
  fields: Readonly<Record<string, CliDiagnosticValue>>
): CliDiagnostic {
  return createCliDiagnostic(code, 'error', message, fields);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Unknown effect host error.';
}
