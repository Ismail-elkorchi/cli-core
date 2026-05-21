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
  readonly searchedPaths?: readonly string[];
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

export interface ConfigDiscoveryEnvironmentInput {
  readonly includeConfigFields?: boolean;
  readonly names?: readonly string[];
}

export interface ConfigDiscoveryRequest {
  readonly host: ConfigDiscoveryHost;
  readonly scope?: ConfigDiscoveryScope;
  readonly cwd?: string;
  readonly root?: string;
  readonly filenames?: readonly string[];
  readonly explicitPaths?: readonly string[];
  readonly environment?: ConfigDiscoveryEnvironmentInput;
  readonly workspaceDefaults?: Readonly<Record<string, ConfigValue>>;
  readonly argv?: Readonly<Record<string, ConfigValue>>;
}

export interface ConfigDiscoveryHost {
  readonly readTextFile: (path: string) => ConfigDiscoveryHostResult<string | undefined>;
  readonly readEnv?: (names: readonly string[]) => ConfigDiscoveryHostResult<Readonly<Record<string, string | undefined>>>;
  readonly joinPath?: (directory: string, filename: string) => string;
  readonly dirname?: (path: string) => string | undefined;
}

export interface ConfigDiscoveryCollection {
  readonly schemaVersion: 'cli-core.config-discovery.v1';
  readonly ok: boolean;
  readonly input: ConfigInput;
  readonly files: readonly ConfigFileInput[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly discovery: ConfigDiscoveryResult;
  readonly diagnostics: readonly CliDiagnostic[];
}

export interface MemoryConfigDiscoveryHost {
  readonly host: ConfigDiscoveryHost;
  readonly files: () => Readonly<Record<string, string>>;
  readonly env: () => Readonly<Record<string, string | undefined>>;
}

export interface MemoryConfigDiscoveryHostInput {
  readonly files?: Readonly<Record<string, string | Readonly<Record<string, ConfigValue>> | ConfigFileInput>>;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export type ConfigDiscoveryHostResult<T> = T | Promise<T>;

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

export async function discoverCliConfigInput(
  program: CliProgram,
  request: ConfigDiscoveryRequest
): Promise<ConfigDiscoveryCollection> {
  const scope = request.scope ?? 'none';
  const candidatePaths = configCandidatePaths(program, request, scope);
  const diagnostics: CliDiagnostic[] = [];
  const files: ConfigFileInput[] = [];

  for (const path of candidatePaths) {
    const file = await readConfigFile(request.host, path, diagnostics);
    if (file !== undefined) files.push(file);
  }

  const env = await discoverEnvironment(program, request, diagnostics);
  const orderedFiles = scope === 'cwd_to_root' ? [...files].reverse() : files;
  const discovery = buildDiscoveryInput(scope, request, candidatePaths);
  const input = freezeConfigInput({
    workspaceDefaults: request.workspaceDefaults,
    configFiles: Object.freeze(orderedFiles),
    env,
    argv: request.argv,
    discovery
  });
  return Object.freeze({
    schemaVersion: 'cli-core.config-discovery.v1' as const,
    ok: !hasErrorDiagnostics(diagnostics),
    input,
    files: Object.freeze(orderedFiles),
    env,
    discovery: buildDiscovery(input.discovery, orderedFiles),
    diagnostics: Object.freeze(diagnostics)
  });
}

export function createMemoryConfigDiscoveryHost(
  input: MemoryConfigDiscoveryHostInput = {}
): MemoryConfigDiscoveryHost {
  const files = new Map<string, string>();
  for (const [path, value] of Object.entries(input.files ?? {})) {
    files.set(normalizePath(path), memoryFileContent(value));
  }
  const envEntries = new Map(Object.entries(input.env ?? {}));
  const env = Object.freeze(Object.fromEntries(envEntries.entries()));
  const host: ConfigDiscoveryHost = Object.freeze({
    readTextFile: (path: string) => files.get(normalizePath(path)),
    readEnv: (names: readonly string[]) => Object.freeze(Object.fromEntries(names.map((name) => [name, envEntries.get(name)]))),
    joinPath,
    dirname
  });
  return Object.freeze({
    host,
    files: () => Object.freeze(Object.fromEntries(files.entries())),
    env: () => env
  });
}

function buildDiscoveryInput(
  scope: ConfigDiscoveryScope,
  request: ConfigDiscoveryRequest,
  searchedPaths: readonly string[]
): ConfigDiscoveryInput {
  return Object.freeze({
    scope,
    ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
    ...(request.explicitPaths === undefined ? {} : { explicitPaths: request.explicitPaths }),
    searchedPaths: Object.freeze([...searchedPaths])
  });
}

function freezeConfigInput(input: {
  readonly workspaceDefaults: Readonly<Record<string, ConfigValue>> | undefined;
  readonly configFiles: readonly ConfigFileInput[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly argv: Readonly<Record<string, ConfigValue>> | undefined;
  readonly discovery: ConfigDiscoveryInput;
}): ConfigInput {
  return Object.freeze({
    ...(input.workspaceDefaults === undefined ? {} : { workspaceDefaults: input.workspaceDefaults }),
    configFiles: input.configFiles,
    env: input.env,
    ...(input.argv === undefined ? {} : { argv: input.argv }),
    discovery: input.discovery
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
  const searchedPaths = discovery?.searchedPaths
    ?? (scope === 'explicit_paths' ? discovery?.explicitPaths ?? [] : files.map((file) => file.path));
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

function configCandidatePaths(
  program: CliProgram,
  request: ConfigDiscoveryRequest,
  scope: ConfigDiscoveryScope
): readonly string[] {
  if (scope === 'none') return Object.freeze([]);
  if (scope === 'explicit_paths') return Object.freeze([...(request.explicitPaths ?? [])]);
  const cwd = request.cwd ?? '.';
  const filenames = request.filenames ?? defaultConfigFilenames(program.name);
  if (scope === 'cwd_only') {
    return Object.freeze(filenames.map((filename) => joinWithHost(request.host, cwd, filename)));
  }
  return Object.freeze(
    candidateDirectories(request.host, cwd, request.root).flatMap((directory) =>
      filenames.map((filename) => joinWithHost(request.host, directory, filename))
    )
  );
}

async function readConfigFile(
  host: ConfigDiscoveryHost,
  path: string,
  diagnostics: CliDiagnostic[]
): Promise<ConfigFileInput | undefined> {
  let content: string | undefined;
  try {
    content = await host.readTextFile(path);
  } catch (error) {
    diagnostics.push(createCliDiagnostic('CLI_CONFIG_DISCOVERY_FAILED', 'error', 'Config discovery host failed to read a file.', {
      path,
      error: error instanceof Error ? error.message : String(error)
    }));
    return undefined;
  }
  if (content === undefined) return undefined;
  return parseConfigFile(path, content, diagnostics);
}

function parseConfigFile(path: string, content: string, diagnostics: CliDiagnostic[]): ConfigFileInput | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    diagnostics.push(createCliDiagnostic('CLI_CONFIG_FILE_INVALID', 'error', 'Config file is not valid JSON.', {
      path,
      error: error instanceof Error ? error.message : String(error)
    }));
    return undefined;
  }
  if (!isRecord(parsed)) {
    diagnostics.push(createCliDiagnostic('CLI_CONFIG_FILE_INVALID', 'error', 'Config file must contain an object.', { path }));
    return undefined;
  }
  const version = typeof parsed.version === 'string' ? parsed.version : undefined;
  const values = isRecord(parsed.values) ? parsed.values : Object.fromEntries(
    Object.entries(parsed).filter(([key]) => key !== 'version')
  );
  if (!isConfigRecord(values)) {
    diagnostics.push(createCliDiagnostic('CLI_CONFIG_FILE_INVALID', 'error', 'Config file contains unsupported values.', { path }));
    return undefined;
  }
  return version === undefined ? { path, values } : { path, version, values };
}

async function discoverEnvironment(
  program: CliProgram,
  request: ConfigDiscoveryRequest,
  diagnostics: CliDiagnostic[]
): Promise<Readonly<Record<string, string | undefined>>> {
  const names = environmentNames(program, request.environment);
  if (names.length === 0 || request.host.readEnv === undefined) return Object.freeze({});
  try {
    return Object.freeze({ ...(await request.host.readEnv(names)) });
  } catch (error) {
    diagnostics.push(createCliDiagnostic('CLI_CONFIG_DISCOVERY_FAILED', 'error', 'Config discovery host failed to read environment values.', {
      error: error instanceof Error ? error.message : String(error)
    }));
    return Object.freeze({});
  }
}

function environmentNames(
  program: CliProgram,
  input: ConfigDiscoveryEnvironmentInput | undefined
): readonly string[] {
  if (input === undefined) return Object.freeze([]);
  const names = new Set<string>(input.names ?? []);
  if (input.includeConfigFields ?? false) {
    for (const field of program.config?.fields ?? []) {
      if (field.env !== undefined) names.add(field.env);
    }
  }
  return Object.freeze([...names]);
}

function defaultConfigFilenames(programName: string): readonly string[] {
  const safeName = programName.replaceAll(/[^A-Za-z0-9._-]/g, '-');
  return Object.freeze([`.${safeName}rc.json`, `${safeName}.config.json`]);
}

function candidateDirectories(
  host: ConfigDiscoveryHost,
  cwd: string,
  root: string | undefined
): readonly string[] {
  const directories: string[] = [];
  let current = normalizePath(cwd);
  const boundary = root === undefined ? undefined : normalizePath(root);
  for (;;) {
    directories.push(current);
    if (boundary !== undefined && current === boundary) break;
    const parent = dirnameWithHost(host, current);
    if (parent === undefined || parent === current) break;
    current = parent;
  }
  return Object.freeze(directories);
}

function joinWithHost(host: ConfigDiscoveryHost, directory: string, filename: string): string {
  return normalizePath(host.joinPath?.(directory, filename) ?? joinPath(directory, filename));
}

function dirnameWithHost(host: ConfigDiscoveryHost, path: string): string | undefined {
  const parent = host.dirname?.(path) ?? dirname(path);
  return parent === undefined ? undefined : normalizePath(parent);
}

function joinPath(directory: string, filename: string): string {
  if (filename.startsWith('/')) return normalizePath(filename);
  if (directory === '' || directory === '.') return normalizePath(filename);
  return normalizePath(`${directory.replace(/\/+$/u, '')}/${filename}`);
}

function dirname(path: string): string | undefined {
  const normalized = normalizePath(path);
  if (normalized === '/' || normalized === '.') return normalized;
  const index = normalized.lastIndexOf('/');
  if (index < 0) return '.';
  if (index === 0) return '/';
  return normalized.slice(0, index);
}

function normalizePath(path: string): string {
  const absolute = path.startsWith('/');
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  const normalized = parts.join('/');
  if (absolute) return `/${normalized}`;
  return normalized.length === 0 ? '.' : normalized;
}

function memoryFileContent(value: string | Readonly<Record<string, ConfigValue>> | ConfigFileInput): string {
  if (typeof value === 'string') return value;
  if ('values' in value && 'path' in value) {
    return JSON.stringify(value.version === undefined ? { values: value.values } : { version: value.version, values: value.values });
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isConfigRecord(value: Readonly<Record<string, unknown>>): value is Readonly<Record<string, ConfigValue>> {
  return Object.values(value).every(isConfigValue);
}

function isConfigValue(value: unknown): value is ConfigValue {
  if (value === null) return true;
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return true;
  if (Array.isArray(value)) return value.every((item) => typeof item === 'string');
  return isRecord(value) && Object.values(value).every(isConfigValue);
}
