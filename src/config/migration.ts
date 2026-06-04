import { createCliDiagnostic, type CliDiagnostic } from '../diagnostics.ts';
import type { ConfigFileInput, ConfigMigration, ConfigValue } from './types.ts';

export function migrateConfigFile(
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
    diagnostics.push(createCliDiagnostic('CLI_CONFIG_MIGRATION_UNCHANGED', 'warning', 'Config migration did not change version.', {
      path: file.path,
      version: file.version
    }));
  }
  return version === undefined ? { path: file.path, values } : { path: file.path, version, values };
}

function applyMigration(values: Readonly<Record<string, ConfigValue>>, migration: ConfigMigration): Record<string, ConfigValue> {
  const next = new Map<string, ConfigValue>(Object.entries(values));
  for (const [from, to] of Object.entries(migration.rename ?? {})) {
    if (next.has(from)) {
      const value = next.get(from)!;
      next.delete(from);
      next.set(to, value);
    }
  }
  for (const removed of migration.remove ?? []) {
    next.delete(removed);
  }
  for (const [key, value] of Object.entries(migration.defaults ?? {})) {
    if (!next.has(key)) next.set(key, value);
  }
  return Object.fromEntries(next.entries());
}
