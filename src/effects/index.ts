import {
  createCliDiagnostic,
  hasErrorDiagnostics,
  type CliDiagnostic,
  type CliDiagnosticValue
} from '../diagnostics.js';
import { cliCorePackage } from '../package.js';
import type { FileRunEffect, RunEffect, RunData, SpawnRunEffect } from '../run/index.js';
import { redactCliDiagnostics, redactCliSecrets, type CliRedactionOptions } from '../schema/index.js';

export { cliCorePackage };
export type { CliCorePackage } from '../package.js';

export type EffectApplicationMode = 'plan' | 'apply';

export interface EffectApplicationPolicy {
  readonly allowSpawn?: boolean;
  readonly allowWriteFile?: boolean;
  readonly allowDeletePath?: boolean;
  readonly allowCustom?: boolean;
}

export interface EffectApplicationRequest {
  readonly mode?: EffectApplicationMode;
  readonly effects: readonly RunEffect[];
  readonly host?: CliEffectHost;
  readonly policy?: EffectApplicationPolicy;
  readonly redaction?: CliRedactionOptions;
}

export interface CliEffectHost {
  readonly applySpawn?: (effect: SpawnRunEffect) => EffectHostResult | Promise<EffectHostResult>;
  readonly writeFile?: (effect: FileRunEffect) => EffectHostResult | Promise<EffectHostResult>;
  readonly deletePath?: (effect: FileRunEffect) => EffectHostResult | Promise<EffectHostResult>;
  readonly applyCustom?: (effect: RunEffect) => EffectHostResult | Promise<EffectHostResult>;
}

export interface EffectHostResult {
  readonly ok?: boolean;
  readonly data?: RunData;
  readonly diagnostics?: readonly CliDiagnostic[];
}

export interface EffectApplicationReport {
  readonly schemaVersion: 'cli-core.effect-application.v1';
  readonly mode: EffectApplicationMode;
  readonly ok: boolean;
  readonly reports: readonly EffectApplicationItemReport[];
  readonly diagnostics: readonly CliDiagnostic[];
}

export interface EffectApplicationItemReport {
  readonly effect: RunEffect;
  readonly status: 'planned' | 'applied' | 'denied' | 'failed';
  readonly data: RunData;
  readonly diagnostics: readonly CliDiagnostic[];
}

export interface MemoryEffectHost {
  readonly host: CliEffectHost;
  readonly files: () => Readonly<Record<string, string>>;
  readonly spawns: () => readonly MemorySpawnRecord[];
}

export interface MemorySpawnRecord {
  readonly command: string;
  readonly argv: readonly string[];
  readonly cwd: string | undefined;
  readonly env: Readonly<Record<string, string>> | undefined;
}

export function planCliEffects(effects: readonly RunEffect[], redaction?: CliRedactionOptions): EffectApplicationReport {
  return finishEffectReport({
    mode: 'plan',
    reports: effects.map((effect) => itemReport(effect, 'planned', null, [])),
    diagnostics: [],
    redaction
  });
}

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
      reports.push(itemReport(effect, result.ok === false || hasErrorDiagnostics(itemDiagnostics) ? 'failed' : 'applied', result.data ?? null, itemDiagnostics));
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
      return { data: { command: effect.command, argv: effect.argv, exitStatus: 0 } };
    },
    writeFile(effect: FileRunEffect): EffectHostResult {
      files.set(effect.path, effect.content ?? '');
      return { data: { path: effect.path, bytes: (effect.content ?? '').length } };
    },
    deletePath(effect: FileRunEffect): EffectHostResult {
      files.delete(effect.path);
      return { data: { path: effect.path, deleted: true } };
    },
    applyCustom(effect: RunEffect): EffectHostResult {
      return { data: { effectKind: effect.kind } };
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
  if (effect.kind === 'spawn') return host.applySpawn?.(effect) ?? {};
  if (effect.kind === 'write_file') return host.writeFile?.(effect) ?? {};
  if (effect.kind === 'delete_path') return host.deletePath?.(effect) ?? {};
  return host.applyCustom?.(effect) ?? {};
}

function itemReport(
  effect: RunEffect,
  status: EffectApplicationItemReport['status'],
  data: RunData,
  diagnostics: readonly CliDiagnostic[]
): EffectApplicationItemReport {
  return Object.freeze({
    effect,
    status,
    data,
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
