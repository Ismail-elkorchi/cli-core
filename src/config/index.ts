import { createCliDiagnostic, hasErrorDiagnostics, type CliDiagnostic } from '../diagnostics.js';
import { cliCorePackage } from '../package.js';
import type { CliProgram } from '../command/index.js';

export { cliCorePackage };
export type { CliCorePackage } from '../package.js';

export type ConfigValue =
  | null
  | boolean
  | number
  | string
  | readonly string[]
  | { readonly [key: string]: ConfigValue };

export type ConfigValueType = 'string' | 'boolean' | 'number' | 'array' | 'object';

export interface ConfigDefinition {
  readonly version?: string;
  readonly fields?: readonly ConfigFieldDefinition[];
  readonly migrations?: readonly ConfigMigration[];
}

export interface ConfigFieldDefinition {
  readonly name: string;
  readonly type: ConfigValueType;
  readonly default?: ConfigValue;
  readonly env?: string;
  readonly option?: string;
  readonly deprecated?: boolean | string;
}

export interface ConfigMigration {
  readonly from: string;
  readonly to: string;
  readonly rename?: Readonly<Record<string, string>>;
  readonly defaults?: Readonly<Record<string, ConfigValue>>;
  readonly remove?: readonly string[];
}

export type ConfigDiscoveryScope = 'none' | 'cwd_only' | 'cwd_to_root' | 'explicit_paths';

export interface ConfigDiscoveryInput {
  readonly scope?: ConfigDiscoveryScope;
  readonly cwd?: string;
  readonly explicitPaths?: readonly string[];
}

export interface ConfigInput {
  readonly workspaceDefaults?: Readonly<Record<string, ConfigValue>>;
  readonly configFiles?: readonly ConfigFileInput[];
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly argv?: Readonly<Record<string, ConfigValue>>;
  readonly discovery?: ConfigDiscoveryInput;
}

export interface ConfigFileInput {
  readonly path: string;
  readonly version?: string;
  readonly values: Readonly<Record<string, ConfigValue>>;
}

export interface ConfigResolution {
  readonly schemaVersion: 'cli-core.config-resolution.v1';
  readonly ok: boolean;
  readonly version: string | undefined;
  readonly values: Readonly<Record<string, ConfigValue>>;
  readonly entries: readonly ConfigResolutionEntry[];
  readonly explanations: readonly ConfigExplanation[];
  readonly discovery: ConfigDiscoveryResult;
  readonly diagnostics: readonly CliDiagnostic[];
}

export interface ConfigResolutionEntry {
  readonly key: string;
  readonly value: ConfigValue;
  readonly source: ConfigSource;
}

export interface ConfigExplanation {
  readonly key: string;
  readonly selected: ConfigSource;
  readonly candidates: readonly ConfigSource[];
}

export interface ConfigSource {
  readonly kind: 'built_in_default' | 'workspace_default' | 'config_file' | 'environment' | 'argv';
  readonly label: string;
  readonly precedence: number;
  readonly path: string | undefined;
}

export interface ConfigDiscoveryResult {
  readonly scope: ConfigDiscoveryScope;
  readonly cwd: string | undefined;
  readonly searchedPaths: readonly string[];
}

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
      diagnostics.push(createCliDiagnostic('CLI_ARGV_FLAG_ISSUE', 'warning', 'Config field is deprecated.', {
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

function migrateConfigFile(
  file: ConfigFileInput,
  migrations: readonly ConfigMigration[],
  diagnostics: CliDiagnostic[]
): ConfigFileInput {
  let version = file.version;
  let values: Record<string, ConfigValue> = { ...file.values };
  for (const migration of migrations) {
    if (version !== migration.from) continue;
    values = applyMigration(values, migration);
    version = migration.to;
  }
  if (file.version !== undefined && version === file.version && migrations.some((migration) => migration.from === file.version)) {
    diagnostics.push(createCliDiagnostic('CLI_ARGV_FLAG_ISSUE', 'warning', 'Config migration did not change version.', {
      path: file.path,
      version: file.version
    }));
  }
  return version === undefined ? { path: file.path, values } : { path: file.path, version, values };
}

function applyMigration(values: Readonly<Record<string, ConfigValue>>, migration: ConfigMigration): Record<string, ConfigValue> {
  const next: Record<string, ConfigValue> = { ...values };
  for (const [from, to] of Object.entries(migration.rename ?? {})) {
    if (next[from] !== undefined) {
      next[to] = next[from];
      delete next[from];
    }
  }
  for (const removed of migration.remove ?? []) {
    delete next[removed];
  }
  for (const [key, value] of Object.entries(migration.defaults ?? {})) {
    if (next[key] === undefined) next[key] = value;
  }
  return next;
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

function buildDiscovery(discovery: ConfigDiscoveryInput | undefined, files: readonly ConfigFileInput[]): ConfigDiscoveryResult {
  const scope = discovery?.scope ?? 'none';
  const searchedPaths = scope === 'explicit_paths' ? discovery?.explicitPaths ?? [] : files.map((file) => file.path);
  return Object.freeze({
    scope,
    cwd: discovery?.cwd,
    searchedPaths: Object.freeze([...searchedPaths])
  });
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
