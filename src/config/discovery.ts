import type { CliProgram } from '../command/index.js';
import { createCliDiagnostic, hasErrorDiagnostics, type CliDiagnostic } from '../diagnostics.js';
import {
  candidateDirectories,
  defaultConfigFilenames,
  joinWithHost
} from './path.js';
import type {
  ConfigDiscoveryCollection,
  ConfigDiscoveryEnvironmentInput,
  ConfigDiscoveryHost,
  ConfigDiscoveryInput,
  ConfigDiscoveryRequest,
  ConfigDiscoveryResult,
  ConfigDiscoveryScope,
  ConfigFileInput,
  ConfigInput,
  ConfigValue
} from './types.js';

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

export function buildDiscovery(discovery: ConfigDiscoveryInput | undefined, files: readonly ConfigFileInput[]): ConfigDiscoveryResult {
  const scope = discovery?.scope ?? 'none';
  const searchedPaths = discovery?.searchedPaths
    ?? (scope === 'explicit_paths' ? discovery?.explicitPaths ?? [] : files.map((file) => file.path));
  return Object.freeze({
    scope,
    cwd: discovery?.cwd,
    searchedPaths: Object.freeze([...searchedPaths])
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
