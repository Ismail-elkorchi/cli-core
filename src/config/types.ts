import type { CliDiagnostic } from '../diagnostics.js';

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
