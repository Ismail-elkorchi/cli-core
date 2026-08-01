import type { CliCommand, CliCommandSource, CliOption, CliPositional, CliProgram } from '../command/index.ts';
import type { CliDiagnostic } from '../diagnostics.ts';
import { cliCorePackage } from '../package.ts';

/**
 * Serializable manifest for a compiled command program.
 */
export interface CommandManifest {
  /** Schema version for this document. */
  readonly schemaVersion: 'cli-core.manifest.v1';
  /** Package metadata for the manifest producer. */
  readonly package: {
    /** Package name that produced the manifest. */
    readonly name: string;
    /** Package version that produced the manifest. */
    readonly version: string;
    /** Version of the public cli-core contract. */
    readonly contractVersion: string;
  };
  /** Root program metadata copied from the compiled program. */
  readonly program: ManifestProgram;
  /** Frozen command tree serialized as a flat list. */
  readonly commands: readonly ManifestCommand[];
  /** Definition diagnostics retained with the manifest. */
  readonly diagnostics: readonly CliDiagnostic[];
}

/**
 * Program metadata stored in a command manifest.
 */
export interface ManifestProgram {
  /** Root program token. */
  readonly name: string;
  /** Program version copied from the definition. */
  readonly version: string | undefined;
  /** Root summary copied from the definition. */
  readonly description: string | undefined;
}

/**
 * Command node stored in a command manifest.
 */
export interface ManifestCommand {
  /** Command identifier used by run handlers and indexes. */
  readonly id: string;
  /** Canonical command token at this path segment. */
  readonly name: string;
  /** Canonical command path for this manifest command. */
  readonly path: readonly string[];
  /** Aliases declared for this command. */
  readonly aliases: readonly ManifestAlias[];
  /** Summary copied from the compiled command. */
  readonly description: string | undefined;
  /** Deprecation marker copied from the compiled command. */
  readonly deprecated: boolean | string | undefined;
  /** Provenance for this command. */
  readonly source: ManifestCommandSource;
  /** Positional entries declared by this command. */
  readonly positionals: readonly ManifestPositional[];
  /** Option entries declared by this command. */
  readonly options: readonly ManifestOption[];
  /** Global options inherited by this command. */
  readonly inheritedOptions: readonly ManifestOption[];
  /** Whether tokens after the pass-through boundary are accepted. */
  readonly allowPassThrough: boolean;
}

/**
 * Command provenance stored in a command manifest.
 */
export type ManifestCommandSource = CliCommandSource;

/**
 * Alias stored in a command manifest.
 */
export interface ManifestAlias {
  /** Alias token at the final alias path segment. */
  readonly name: string;
  /** Alias path for this manifest alias. */
  readonly path: readonly string[];
  /** Deprecation marker copied from the compiled alias. */
  readonly deprecated: boolean | string | undefined;
}

/**
 * Positional argument stored in a command manifest.
 */
export interface ManifestPositional {
  /** Positional key used in parsed output. */
  readonly name: string;
  /** Indicates whether parsing requires this positional. */
  readonly required: boolean;
  /** Whether this positional captures remaining tokens. */
  readonly variadic: boolean;
  /** Summary copied from the positional definition. */
  readonly description: string | undefined;
}

/**
 * Option stored in a command manifest.
 */
export interface ManifestOption {
  /** Option key used in parsed output. */
  readonly name: string;
  /** Value category exposed to option-binding integrations. */
  readonly type: string;
  /** Flag spellings accepted for this option. */
  readonly flags: readonly string[];
  /** Summary copied from the option definition. */
  readonly description: string | undefined;
  /** Indicates whether parsing requires this option. */
  readonly required: boolean;
  /** Indicates whether default help and completion omit this option. */
  readonly hidden: boolean;
  /** Indicates whether the option is inherited or local. */
  readonly scope: 'global' | 'local';
}

/**
 * Creates a command manifest from a compiled program.
 */
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

/**
 * Serializes a command manifest as JSON.
 */
export function exportCommandManifest(manifest: CommandManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Imports and validates a command manifest JSON payload.
 */
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
