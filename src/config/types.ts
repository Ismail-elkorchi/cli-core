import type { CliDiagnostic } from '../diagnostics.ts';

/**
 * JSON-compatible config value accepted by resolution and discovery hosts.
 */
export type ConfigValue =
  | null
  | boolean
  | number
  | string
  | readonly string[]
  | { readonly [key: string]: ConfigValue };

/**
 * Declared config field categories supported by resolution.
 */
export type ConfigValueType = 'string' | 'boolean' | 'number' | 'array' | 'object';

/**
 * Program-level config fields and migrations.
 */
export interface ConfigDefinition {
  /** Current version used as the migration target for discovered files. */
  readonly version?: string;
  /** Fields that participate in precedence, coercion, and diagnostics. */
  readonly fields?: readonly ConfigFieldDefinition[];
  /** Ordered migration steps available for versioned config files. */
  readonly migrations?: readonly ConfigMigration[];
}

/**
 * Single config field and its optional env or argv binding.
 */
export interface ConfigFieldDefinition {
  /** Config key used in values, explanations, and diagnostics. */
  readonly name: string;
  /** Value category used for config and env coercion. */
  readonly type: ConfigValueType;
  /** Default value when no explicit value is supplied. */
  readonly default?: ConfigValue;
  /** Environment variable name captured by discovery or explicit input. */
  readonly env?: string;
  /** Option name that can provide this config field. */
  readonly option?: string;
  /** Deprecation marker emitted when a value is resolved for this field. */
  readonly deprecated?: boolean | string;
}

/**
 * Versioned config-file migration step.
 */
export interface ConfigMigration {
  /** Source config version for this migration. */
  readonly from: string;
  /** Target config version for this migration. */
  readonly to: string;
  /** Field renames applied by this migration. */
  readonly rename?: Readonly<Record<string, string>>;
  /** Built-in default config values. */
  readonly defaults?: Readonly<Record<string, ConfigValue>>;
  /** Field names removed by this migration. */
  readonly remove?: readonly string[];
}

/**
 * Discovery modes supported by explicit config hosts.
 */
export type ConfigDiscoveryScope = 'none' | 'cwd_only' | 'cwd_to_root' | 'explicit_paths';

/**
 * Discovery metadata carried into resolution explanations.
 */
export interface ConfigDiscoveryInput {
  /** Discovery mode that produced the searched path list. */
  readonly scope?: ConfigDiscoveryScope;
  /** Working directory when one is provided. */
  readonly cwd?: string;
  /** Explicit paths supplied for discovery. */
  readonly explicitPaths?: readonly string[];
  /** Config paths searched by discovery. */
  readonly searchedPaths?: readonly string[];
}

/**
 * Explicit config layers consumed by {@link resolveCliConfig}.
 */
export interface ConfigInput {
  /** Workspace default config values. */
  readonly workspaceDefaults?: Readonly<Record<string, ConfigValue>>;
  /** Ordered config file inputs. */
  readonly configFiles?: readonly ConfigFileInput[];
  /** Captured environment values supplied explicitly by the caller or host. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Option-derived config values supplied after parsing. */
  readonly argv?: Readonly<Record<string, ConfigValue>>;
  /** Discovery metadata associated with this input. */
  readonly discovery?: ConfigDiscoveryInput;
}

/**
 * Config file values already discovered by a caller or host.
 */
export interface ConfigFileInput {
  /** Filesystem path for this config file. */
  readonly path: string;
  /** Version read from this config file before migration. */
  readonly version?: string;
  /** Resolved values keyed by public name. */
  readonly values: Readonly<Record<string, ConfigValue>>;
}

/**
 * Resolved config values with source provenance.
 */
export interface ConfigResolution {
  /** Schema version for this document. */
  readonly schemaVersion: 'cli-core.config-resolution.v1';
  /** False when resolution produced an error diagnostic. */
  readonly ok: boolean;
  /** Target config version used after migrations. */
  readonly version: string | undefined;
  /** Resolved values keyed by public name. */
  readonly values: Readonly<Record<string, ConfigValue>>;
  /** Selected entries in precedence order. */
  readonly entries: readonly ConfigResolutionEntry[];
  /** Human-readable provenance explanations. */
  readonly explanations: readonly ConfigExplanation[];
  /** Discovery metadata associated with this resolution. */
  readonly discovery: ConfigDiscoveryResult;
  /** Resolution, coercion, migration, and deprecation diagnostics. */
  readonly diagnostics: readonly CliDiagnostic[];
}

/**
 * Selected value for one config key.
 */
export interface ConfigResolutionEntry {
  /** Config key for this selected entry. */
  readonly key: string;
  /** Value selected after precedence and coercion. */
  readonly value: ConfigValue;
  /** Source that won precedence for this key. */
  readonly source: ConfigSource;
}

/**
 * Provenance explanation for one config key.
 */
export interface ConfigExplanation {
  /** Config key explained by this entry. */
  readonly key: string;
  /** Source selected by precedence. */
  readonly selected: ConfigSource;
  /** Value selected by precedence. */
  readonly selectedValue: ConfigValue;
  /** Candidate sources considered for the key. */
  readonly candidates: readonly ConfigSource[];
  /** Candidate values considered for the key. */
  readonly candidateValues: readonly ConfigCandidate[];
}

/**
 * Candidate value considered during precedence resolution.
 */
export interface ConfigCandidate {
  /** Source layer that supplied this candidate. */
  readonly source: ConfigSource;
  /** Candidate value after layer-specific coercion. */
  readonly value: ConfigValue;
  /** Whether this candidate was selected. */
  readonly selected: boolean;
}

/**
 * Source layer participating in config precedence.
 */
export interface ConfigSource {
  /** Precedence layer represented by this source. */
  readonly kind: 'built_in_default' | 'workspace_default' | 'config_file' | 'environment' | 'argv';
  /** Human-facing label used in config explanations. */
  readonly label: string;
  /** Numeric precedence for this config source. */
  readonly precedence: number;
  /** Filesystem path when this source came from a config file. */
  readonly path: string | undefined;
}

/**
 * Summary of paths searched by config discovery.
 */
export interface ConfigDiscoveryResult {
  /** Discovery mode used to compute searched paths. */
  readonly scope: ConfigDiscoveryScope;
  /** Working directory when one is provided. */
  readonly cwd: string | undefined;
  /** Config paths searched by discovery. */
  readonly searchedPaths: readonly string[];
}

/**
 * Environment capture settings for config discovery.
 */
export interface ConfigDiscoveryEnvironmentInput {
  /** Whether field env bindings are included. */
  readonly includeConfigFields?: boolean;
  /** Extra environment names to capture. */
  readonly names?: readonly string[];
}

/**
 * Host-driven request for gathering config input.
 */
export interface ConfigDiscoveryRequest {
  /** Explicit host adapter used by this operation. */
  readonly host: ConfigDiscoveryHost;
  /** Discovery mode to run against the host. */
  readonly scope?: ConfigDiscoveryScope;
  /** Working directory when one is provided. */
  readonly cwd?: string;
  /** Root boundary for path discovery. */
  readonly root?: string;
  /** Candidate config filenames. */
  readonly filenames?: readonly string[];
  /** Explicit paths supplied for discovery. */
  readonly explicitPaths?: readonly string[];
  /** Environment capture settings. */
  readonly environment?: ConfigDiscoveryEnvironmentInput;
  /** Workspace default config values. */
  readonly workspaceDefaults?: Readonly<Record<string, ConfigValue>>;
  /** Option-derived config values to merge into the collected input. */
  readonly argv?: Readonly<Record<string, ConfigValue>>;
}

/**
 * Explicit host adapter for reading config files and environment values.
 */
export interface ConfigDiscoveryHost {
  /** Reads a text file from the discovery host. */
  readonly readTextFile: (path: string) => ConfigDiscoveryHostResult<string | undefined>;
  /** Reads environment values from the discovery host. */
  readonly readEnv?: (names: readonly string[]) => ConfigDiscoveryHostResult<Readonly<Record<string, string | undefined>>>;
  /** Joins a directory and filename in the discovery host. */
  readonly joinPath?: (directory: string, filename: string) => string;
  /** Returns a parent path in the discovery host. */
  readonly dirname?: (path: string) => string | undefined;
}

/**
 * Config input gathered by a discovery host.
 */
export interface ConfigDiscoveryCollection {
  /** Schema version for this document. */
  readonly schemaVersion: 'cli-core.config-discovery.v1';
  /** False when collection produced an error diagnostic. */
  readonly ok: boolean;
  /** Config input assembled for {@link resolveCliConfig}. */
  readonly input: ConfigInput;
  /** Config files successfully read and parsed by the host. */
  readonly files: readonly ConfigFileInput[];
  /** Environment values captured from the host. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Discovery result metadata. */
  readonly discovery: ConfigDiscoveryResult;
  /** Discovery, read, and parse diagnostics. */
  readonly diagnostics: readonly CliDiagnostic[];
}

/**
 * In-memory config discovery host for tests and examples.
 */
export interface MemoryConfigDiscoveryHost {
  /** Explicit host adapter used by this operation. */
  readonly host: ConfigDiscoveryHost;
  /** Returns the current in-memory file snapshot. */
  readonly files: () => Readonly<Record<string, string>>;
  /** Returns the current in-memory environment snapshot. */
  readonly env: () => Readonly<Record<string, string | undefined>>;
}

/**
 * Initial files and environment for the memory config host.
 */
export interface MemoryConfigDiscoveryHostInput {
  /** Initial file map used by the memory host. */
  readonly files?: Readonly<Record<string, string | Readonly<Record<string, ConfigValue>> | ConfigFileInput>>;
  /** Initial environment map used by the memory host. */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/**
 * Synchronous or asynchronous value returned by a config host.
 */
export type ConfigDiscoveryHostResult<T> = T | Promise<T>;
