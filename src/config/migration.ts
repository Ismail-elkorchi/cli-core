import { createCliDiagnostic, type CliDiagnostic } from '../diagnostics.js';
import type { ConfigFileInput, ConfigMigration, ConfigValue } from './types.js';

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
