import type { CliCommand, CliCommandSource, CliOption, CliPositional, CliProgram } from '../command/index.ts';
import type { CliDiagnostic } from '../diagnostics.ts';
import { cliCorePackage } from '../package.ts';

export interface CommandManifest {
  readonly schemaVersion: 'cli-core.manifest.v1';
  readonly package: {
    readonly name: string;
    readonly version: string;
    readonly contractVersion: string;
  };
  readonly program: ManifestProgram;
  readonly commands: readonly ManifestCommand[];
  readonly diagnostics: readonly CliDiagnostic[];
}

export interface ManifestProgram {
  readonly name: string;
  readonly version: string | undefined;
  readonly description: string | undefined;
}

export interface ManifestCommand {
  readonly id: string;
  readonly name: string;
  readonly path: readonly string[];
  readonly aliases: readonly ManifestAlias[];
  readonly description: string | undefined;
  readonly deprecated: boolean | string | undefined;
  readonly source: ManifestCommandSource;
  readonly positionals: readonly ManifestPositional[];
  readonly options: readonly ManifestOption[];
  readonly inheritedOptions: readonly ManifestOption[];
  readonly allowPassThrough: boolean;
}

export type ManifestCommandSource = CliCommandSource;

export interface ManifestAlias {
  readonly name: string;
  readonly path: readonly string[];
  readonly deprecated: boolean | string | undefined;
}

export interface ManifestPositional {
  readonly name: string;
  readonly required: boolean;
  readonly variadic: boolean;
  readonly description: string | undefined;
}

export interface ManifestOption {
  readonly name: string;
  readonly type: string;
  readonly flags: readonly string[];
  readonly description: string | undefined;
  readonly required: boolean;
  readonly hidden: boolean;
  readonly scope: 'global' | 'local';
}

export function describeCli(program: CliProgram): CommandManifest {
  return Object.freeze({
    schemaVersion: 'cli-core.manifest.v1',
    package: Object.freeze({ ...cliCorePackage }),
    program: Object.freeze({
      name: program.name,
      version: program.version,
      description: program.description
    }),
    commands: Object.freeze(program.commands.map(toManifestCommand)),
    diagnostics: Object.freeze([...program.diagnostics])
  });
}

export function exportCommandManifest(manifest: CommandManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function importCommandManifest(input: string | CommandManifest): CommandManifest {
  const parsed = typeof input === 'string' ? JSON.parse(input) as unknown : input;
  assertCommandManifestShape(parsed);
  return freezeManifest(parsed);
}

function assertCommandManifestShape(input: unknown): asserts input is CommandManifest {
  if (!isRecord(input)) {
    throw new TypeError('Command manifest must be an object.');
  }
  if (input.schemaVersion !== 'cli-core.manifest.v1') {
    throw new TypeError('Unsupported command manifest schemaVersion.');
  }
  if (!isRecord(input.package)) {
    throw new TypeError('Command manifest package must be an object.');
  }
  if (!isRecord(input.program)) {
    throw new TypeError('Command manifest program must be an object.');
  }
  if (!Array.isArray(input.commands)) {
    throw new TypeError('Command manifest commands must be an array.');
  }
  if (!Array.isArray(input.diagnostics)) {
    throw new TypeError('Command manifest diagnostics must be an array.');
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toManifestCommand(command: CliCommand): ManifestCommand {
  return Object.freeze({
    id: command.id,
    name: command.name,
    path: Object.freeze([...command.path]),
    aliases: Object.freeze(command.aliases.map((alias) => Object.freeze({
      name: alias.name,
      path: Object.freeze([...alias.path]),
      deprecated: alias.deprecated
    }))),
    description: command.description,
    deprecated: command.deprecated,
    source: Object.freeze({ ...command.source }),
    positionals: Object.freeze(command.positionals.map(toManifestPositional)),
    options: Object.freeze(command.options.map(toManifestOption)),
    inheritedOptions: Object.freeze(command.inheritedOptions.map(toManifestOption)),
    allowPassThrough: command.allowPassThrough
  });
}

function toManifestPositional(positional: CliPositional): ManifestPositional {
  return Object.freeze({
    name: positional.name,
    required: positional.required,
    variadic: positional.variadic,
    description: positional.description
  });
}

function toManifestOption(option: CliOption): ManifestOption {
  return Object.freeze({
    name: option.name,
    type: option.type,
    flags: Object.freeze([...option.flags]),
    description: option.description,
    required: option.required,
    hidden: option.hidden,
    scope: option.scope
  });
}

function freezeManifest(manifest: CommandManifest): CommandManifest {
  return Object.freeze({
    schemaVersion: manifest.schemaVersion,
    package: Object.freeze({ ...manifest.package }),
    program: Object.freeze({ ...manifest.program }),
    commands: Object.freeze(manifest.commands.map((command) => Object.freeze({
      ...command,
      path: Object.freeze([...command.path]),
      aliases: Object.freeze(command.aliases.map((alias) => Object.freeze({
        ...alias,
        path: Object.freeze([...alias.path])
      }))),
      positionals: Object.freeze(command.positionals.map((positional) => Object.freeze({ ...positional }))),
      source: Object.freeze({ ...command.source }),
      options: Object.freeze(command.options.map((option) => Object.freeze({
        ...option,
        flags: Object.freeze([...option.flags])
      }))),
      inheritedOptions: Object.freeze(command.inheritedOptions.map((option) => Object.freeze({
        ...option,
        flags: Object.freeze([...option.flags])
      })))
    }))),
    diagnostics: Object.freeze([...manifest.diagnostics])
  });
}
