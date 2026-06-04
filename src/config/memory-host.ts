import {
  dirname,
  joinPath,
  normalizePath
} from './path.ts';
import type {
  ConfigFileInput,
  ConfigValue,
  ConfigDiscoveryHost,
  MemoryConfigDiscoveryHost,
  MemoryConfigDiscoveryHostInput
} from './types.ts';

/**
 * Creates an in-memory config discovery host.
 */
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

function memoryFileContent(value: string | Readonly<Record<string, ConfigValue>> | ConfigFileInput): string {
  if (typeof value === 'string') return value;
  if ('values' in value && 'path' in value) {
    // Stryker disable next-line ConditionalExpression: JSON.stringify omits undefined fields, so the unversioned fixture branch is equivalent to an undefined version property.
    return JSON.stringify(value.version === undefined ? { values: value.values } : { version: value.version, values: value.values });
  }
  return JSON.stringify(value);
}
