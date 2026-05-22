import type { CliProgram } from '../command/index.js';
import { createCliDiagnostic, hasErrorDiagnostics, type CliDiagnostic } from '../diagnostics.js';
import { buildDiscovery } from './discovery.js';
import { migrateConfigFile } from './migration.js';
import type {
  ConfigFieldDefinition,
  ConfigInput,
  ConfigResolution,
  ConfigResolutionEntry,
  ConfigExplanation,
  ConfigSource,
  ConfigValue
} from './types.js';

export function resolveCliConfig(program: CliProgram, input: ConfigInput = {}): ConfigResolution {
  const definition = program.config;
  const diagnostics: CliDiagnostic[] = [];
  const layers: ConfigResolutionEntry[] = [];
  const fields = definition?.fields ?? [];
  const version = definition?.version;

  for (const field of fields) {
    if (field.default !== undefined) {
      layers.push(entry(field.name, field.default, source('built_in_default', 'built-in default', 0)));
    }
  }
  for (const [key, value] of Object.entries(input.workspaceDefaults ?? {})) {
    layers.push(entry(key, value, source('workspace_default', 'workspace default', 1)));
  }
  for (const file of input.configFiles ?? []) {
    const migrated = migrateConfigFile(file, definition?.migrations ?? [], diagnostics);
    for (const [key, value] of Object.entries(migrated.values)) {
      layers.push(entry(key, value, source('config_file', file.path, 2, file.path)));
    }
  }
  for (const field of fields) {
    if (field.env === undefined) continue;
    const raw = input.env?.[field.env];
    if (raw !== undefined) {
      layers.push(entry(field.name, coerceEnvValue(raw, field), source('environment', field.env, 3)));
    }
  }
  for (const [key, value] of Object.entries(input.argv ?? {})) {
    layers.push(entry(key, value, source('argv', 'argv', 4)));
  }

  const selected = selectEntries(layers);
  for (const field of fields) {
    if (field.deprecated !== undefined && selected.values[field.name] !== undefined) {
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
  readonly entries: readonly ConfigResolutionEntry[];
  readonly explanations: readonly ConfigExplanation[];
} {
  const byKey = new Map<string, ConfigResolutionEntry[]>();
  for (const item of entries) {
    const existing = byKey.get(item.key) ?? [];
    existing.push(item);
    byKey.set(item.key, existing);
  }

  const values: Record<string, ConfigValue> = {};
  const selectedEntries: ConfigResolutionEntry[] = [];
  const explanations: ConfigExplanation[] = [];
  for (const [key, candidates] of byKey) {
    const ordered = [...candidates].sort((left, right) => left.source.precedence - right.source.precedence);
    const selected = ordered.at(-1);
    if (selected === undefined) continue;
    values[key] = selected.value;
    selectedEntries.push(selected);
    explanations.push(Object.freeze({
      key,
      selected: selected.source,
      candidates: Object.freeze(ordered.map((candidate) => candidate.source))
    }));
  }
  return {
    values,
    entries: Object.freeze(selectedEntries),
    explanations: Object.freeze(explanations)
  };
}

function coerceEnvValue(raw: string, field: ConfigFieldDefinition): ConfigValue {
  if (field.type === 'boolean') return raw === 'true' || raw === '1';
  if (field.type === 'number') return Number(raw);
  if (field.type === 'array') return raw.length === 0 ? [] : raw.split(',');
  return raw;
}

function entry(key: string, value: ConfigValue, entrySource: ConfigSource): ConfigResolutionEntry {
  return Object.freeze({ key, value, source: entrySource });
}

function source(kind: ConfigSource['kind'], label: string, precedence: number, path?: string): ConfigSource {
  return Object.freeze({ kind, label, precedence, path });
}
