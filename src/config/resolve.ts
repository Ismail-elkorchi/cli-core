import type { CliProgram } from '../command/index.ts';
import { createCliDiagnostic, hasErrorDiagnostics, type CliDiagnostic } from '../diagnostics.ts';
import { buildDiscovery } from './discovery.ts';
import { migrateConfigFile } from './migration.ts';
import type {
  ConfigFieldDefinition,
  ConfigInput,
  ConfigResolution,
  ConfigCandidate,
  ConfigResolutionEntry,
  ConfigExplanation,
  ConfigSource,
  ConfigValue
} from './types.ts';

/**
 * Resolves explicit config layers into values and provenance explanations.
 *
 * @example
 * ```ts
 * import { defineCli, resolveCliConfig } from '@ismail-elkorchi/cli-core';
 *
 * const program = defineCli({
 *   name: 'ship',
 *   config: {
 *     fields: [{ name: 'region', type: 'string', default: 'local', env: 'SHIP_REGION' }]
 *   }
 * });
 *
 * const config = resolveCliConfig(program, {
 *   workspaceDefaults: { region: 'workspace' },
 *   configFiles: [{ path: 'ship.json', values: { region: 'file' } }],
 *   env: { SHIP_REGION: 'env' },
 *   argv: { region: 'argv' }
 * });
 *
 * config.values.region; // "argv"
 * config.explanations[0]?.candidateValues;
 * ```
 */
export function resolveCliConfig(program: CliProgram, input: ConfigInput = {}): ConfigResolution {
  const definition = program.config;
  const diagnostics: CliDiagnostic[] = [];
  const layers: ConfigResolutionEntry[] = [];
  const fields = definition?.fields ?? [];
  const fieldsByName = new Map(fields.map((field) => [field.name, field]));
  const version = definition?.version;

  for (const field of fields) {
    if (field.default !== undefined) {
      addLayerEntry(
        layers,
        diagnostics,
        fieldsByName,
        field.name,
        field.default,
        source('built_in_default', 'built-in default', 0)
      );
    }
  }
  for (const [key, value] of Object.entries(input.workspaceDefaults ?? {})) {
    addLayerEntry(layers, diagnostics, fieldsByName, key, value, source('workspace_default', 'workspace default', 1));
  }
  for (const file of input.configFiles ?? []) {
    const migrated = migrateConfigFile(file, definition?.migrations ?? [], diagnostics);
    for (const [key, value] of Object.entries(migrated.values)) {
      addLayerEntry(layers, diagnostics, fieldsByName, key, value, source('config_file', file.path, 2, file.path));
    }
  }
  for (const field of fields) {
    if (field.env === undefined) continue;
    const raw = input.env?.[field.env];
    if (raw !== undefined) {
      const coerced = coerceEnvValue(raw, field);
      if (coerced.ok) {
        layers.push(entry(field.name, coerced.value, source('environment', field.env, 3)));
      } else {
        diagnostics.push(coerced.diagnostic);
      }
    }
  }
  for (const [key, value] of Object.entries(input.argv ?? {})) {
    addLayerEntry(layers, diagnostics, fieldsByName, key, value, source('argv', 'argv', 4));
  }

  const selected = selectEntries(layers);
  for (const field of fields) {
    if (field.deprecated !== undefined && selected.has(field.name)) {
      diagnostics.push(createCliDiagnostic('CLI_CONFIG_FIELD_DEPRECATED', 'warning', 'Config field is deprecated.', {
        field: field.name,
        reason: typeof field.deprecated === 'string' ? field.deprecated : ''
      }));
    }
  }

  return Object.freeze({
    schemaVersion: 'cli-core.config-resolution.v1',
    ok: !hasErrorDiagnostics(diagnostics),
    version,
    values: Object.freeze(selected.values),
    entries: Object.freeze(selected.entries),
    explanations: Object.freeze(selected.explanations),
    discovery: buildDiscovery(input.discovery, input.configFiles ?? []),
    diagnostics: Object.freeze(diagnostics)
  });
}

function selectEntries(entries: readonly ConfigResolutionEntry[]): {
  readonly values: Record<string, ConfigValue>;
  readonly has: (key: string) => boolean;
  readonly entries: readonly ConfigResolutionEntry[];
  readonly explanations: readonly ConfigExplanation[];
} {
  const byKey = new Map<string, ConfigResolutionEntry[]>();
  for (const item of entries) {
    const existing = byKey.get(item.key) ?? [];
    existing.push(item);
    byKey.set(item.key, existing);
  }

  const values = new Map<string, ConfigValue>();
  const selectedEntries: ConfigResolutionEntry[] = [];
  const explanations: ConfigExplanation[] = [];
  for (const [key, candidates] of byKey) {
    const ordered = [...candidates].sort((left, right) => left.source.precedence - right.source.precedence);
    const selected = ordered.at(-1);
    if (selected === undefined) continue;
    values.set(key, selected.value);
    selectedEntries.push(selected);
    explanations.push(Object.freeze({
      key,
      selected: selected.source,
      selectedValue: selected.value,
      candidates: Object.freeze(ordered.map((candidate) => candidate.source)),
      candidateValues: Object.freeze(ordered.map((candidate): ConfigCandidate => Object.freeze({
        source: candidate.source,
        value: candidate.value,
        selected: candidate === selected
      })))
    }));
  }
  return {
    values: Object.freeze(Object.fromEntries(values.entries())),
    has: (key: string) => values.has(key),
    entries: Object.freeze(selectedEntries),
    explanations: Object.freeze(explanations)
  };
}

function addLayerEntry(
  layers: ConfigResolutionEntry[],
  diagnostics: CliDiagnostic[],
  fieldsByName: ReadonlyMap<string, ConfigFieldDefinition>,
  key: string,
  value: ConfigValue,
  entrySource: ConfigSource
): void {
  const field = fieldsByName.get(key);
  if (field === undefined) {
    diagnostics.push(createCliDiagnostic('CLI_CONFIG_KEY_UNKNOWN', 'error', 'Config key is not declared by the program.', {
      key,
      source: entrySource.kind,
      path: entrySource.path ?? ''
    }));
    return;
  }
  if (!isConfigValueForField(value, field)) {
    diagnostics.push(invalidValueDiagnostic(field, entrySource, value));
    return;
  }
  layers.push(entry(key, value, entrySource));
}

function coerceEnvValue(raw: string, field: ConfigFieldDefinition): {
  readonly ok: true;
  readonly value: ConfigValue;
} | {
  readonly ok: false;
  readonly diagnostic: CliDiagnostic;
} {
  if (field.type === 'boolean') {
    const normalized = raw.toLowerCase();
    if (normalized === 'true' || normalized === '1') return { ok: true, value: true };
    if (normalized === 'false' || normalized === '0') return { ok: true, value: false };
    return { ok: false, diagnostic: invalidEnvDiagnostic(field, raw) };
  }
  if (field.type === 'number') {
    const value = Number(raw);
    if (raw.trim().length > 0 && Number.isFinite(value)) return { ok: true, value };
    return { ok: false, diagnostic: invalidEnvDiagnostic(field, raw) };
  }
  if (field.type === 'array') return { ok: true, value: raw.length === 0 ? [] : raw.split(',') };
  if (field.type === 'object') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (isConfigValueForField(parsed, field)) return { ok: true, value: parsed };
    } catch {
      return { ok: false, diagnostic: invalidEnvDiagnostic(field, raw) };
    }
    return { ok: false, diagnostic: invalidEnvDiagnostic(field, raw) };
  }
  return { ok: true, value: raw };
}

function entry(key: string, value: ConfigValue, entrySource: ConfigSource): ConfigResolutionEntry {
  return Object.freeze({ key, value, source: entrySource });
}

function source(kind: ConfigSource['kind'], label: string, precedence: number, path?: string): ConfigSource {
  return Object.freeze({ kind, label, precedence, path });
}

function isConfigValueForField(value: unknown, field: ConfigFieldDefinition): value is ConfigValue {
  if (field.type === 'string') return typeof value === 'string';
  if (field.type === 'boolean') return typeof value === 'boolean';
  if (field.type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (field.type === 'array') return Array.isArray(value) && value.every((item) => typeof item === 'string');
  return isConfigRecord(value);
}

function isConfigRecord(value: unknown): value is Readonly<Record<string, ConfigValue>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(isConfigValue);
}

function isConfigValue(value: unknown): value is ConfigValue {
  if (value === null) return true;
  if (typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => typeof item === 'string');
  return isConfigRecord(value);
}

function invalidValueDiagnostic(field: ConfigFieldDefinition, entrySource: ConfigSource, value: unknown): CliDiagnostic {
  return createCliDiagnostic('CLI_CONFIG_VALUE_INVALID', 'error', 'Config value does not match the declared field type.', {
    field: field.name,
    expectedType: field.type,
    actualType: configValueType(value),
    source: entrySource.kind,
    path: entrySource.path ?? ''
  });
}

function invalidEnvDiagnostic(field: ConfigFieldDefinition, raw: string): CliDiagnostic {
  return createCliDiagnostic('CLI_CONFIG_VALUE_INVALID', 'error', 'Environment config value cannot be coerced to the declared field type.', {
    field: field.name,
    expectedType: field.type,
    source: 'environment',
    raw
  });
}

function configValueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isNaN(value)) return 'nan';
  return typeof value;
}
