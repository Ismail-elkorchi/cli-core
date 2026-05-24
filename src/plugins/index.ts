import {
  defineCli,
  findCliCommandChildren,
  type CliAliasInput,
  type CliCommand,
  type CliCommandDefinition,
  type CliDefinition,
  type CliOption,
  type CliOptionDefinition,
  type CliPositional,
  type CliPositionalDefinition,
  type CliProgram
} from '../command/index.js';
import {
  createCliDiagnostic,
  hasErrorDiagnostics,
  type CliDiagnostic,
  type CliDiagnosticValue
} from '../diagnostics.js';
import { cliCorePackage } from '../package.js';

export type CliPluginRuntime = 'node' | 'deno' | 'bun';

export type CliPluginHookEvent =
  | 'init'
  | 'preparse'
  | 'prerun'
  | 'postrun'
  | 'finally'
  | 'command_not_found';

export type CliPluginPayload = CliDiagnosticValue;

export interface CliPluginManifestDefinition {
  readonly name: string;
  readonly version: string;
  readonly cliCore?: CliPluginCoreCompatibility;
  readonly runtimes?: readonly CliPluginRuntime[];
  readonly capabilities?: readonly string[];
  readonly commands?: readonly CliCommandDefinition[];
  readonly hooks?: readonly CliPluginHookDefinitionInput[];
}

export interface CliPluginCoreCompatibility {
  readonly minVersion?: string;
  readonly maxVersion?: string;
}

export interface CliPluginHookDefinitionInput {
  readonly name: string;
  readonly event: CliPluginHookEvent;
  readonly order?: number;
  readonly before?: readonly string[];
  readonly after?: readonly string[];
}

export interface CliPluginHookDefinition {
  readonly name: string;
  readonly event: CliPluginHookEvent;
  readonly order: number;
  readonly before: readonly string[];
  readonly after: readonly string[];
}

export interface CliPluginManifest {
  readonly schemaVersion: 'cli-core.plugin.v1';
  readonly name: string;
  readonly version: string;
  readonly cliCore: CliPluginCoreCompatibility;
  readonly runtimes: readonly CliPluginRuntime[];
  readonly capabilities: readonly string[];
  readonly commands: readonly CliCommandDefinition[];
  readonly hooks: readonly CliPluginHookDefinition[];
}

export interface CliPluginRegistration {
  readonly manifest: CliPluginManifestDefinition | CliPluginManifest;
  readonly load: CliPluginLoader;
}

export type CliPluginLoader = () => CliPluginModule | Promise<CliPluginModule>;

export interface CliPluginModule {
  readonly manifest?: CliPluginManifest;
  readonly hooks?: Readonly<Record<string, CliPluginHookHandler>>;
}

export type CliPluginHookHandler = (
  context: CliPluginHookContext
) => CliPluginHookOutput | void | Promise<CliPluginHookOutput | void>;

export interface CliPluginHookContext {
  readonly event: CliPluginHookEvent;
  readonly pluginName: string;
  readonly hookName: string;
  readonly payload: CliPluginPayload;
}

export interface CliPluginHookOutput {
  readonly effects?: readonly CliPluginEffect[];
  readonly diagnostics?: readonly CliDiagnostic[];
}

export interface CliPluginEffect {
  readonly kind: string;
  readonly payload?: CliPluginPayload;
}

export interface CliPluginHostInput {
  readonly cliCoreVersion?: string;
  readonly runtime?: CliPluginRuntime;
  readonly allowedCapabilities?: readonly string[];
}

export interface CliPluginCompatibilityResult {
  readonly ok: boolean;
  readonly manifest: CliPluginManifest;
  readonly diagnostics: readonly CliDiagnostic[];
}

export type CliPluginCommandApplicationInput = CliPluginHostInput;

export interface CliPluginCommandApplication {
  readonly schemaVersion: 'cli-core.plugin-command-application.v1';
  readonly ok: boolean;
  readonly definition: CliDefinition;
  readonly program: CliProgram;
  readonly contributions: readonly CliPluginCommandContribution[];
  readonly diagnostics: readonly CliDiagnostic[];
}

export interface CliPluginCommandContribution {
  readonly pluginName: string;
  readonly pluginVersion: string;
  readonly commandPaths: readonly (readonly string[])[];
  readonly aliasPaths: readonly (readonly string[])[];
}

export interface CliPluginHost {
  readonly manifests: readonly CliPluginManifest[];
  readonly diagnostics: readonly CliDiagnostic[];
  readonly checkPlugin: (name: string) => CliPluginCompatibilityResult | undefined;
  readonly planHooks: (event: CliPluginHookEvent) => CliPluginHookPlan;
  readonly loadPlugin: (name: string) => Promise<CliPluginLoadResult>;
  readonly runHooks: (event: CliPluginHookEvent, context?: CliPluginHookRunInput) => Promise<CliPluginHookRunResult>;
}

export interface CliPluginHookPlan {
  readonly event: CliPluginHookEvent;
  readonly hooks: readonly CliPluginHookReference[];
  readonly diagnostics: readonly CliDiagnostic[];
}

export interface CliPluginHookReference {
  readonly id: string;
  readonly pluginName: string;
  readonly hookName: string;
  readonly event: CliPluginHookEvent;
  readonly order: number;
}

export interface CliPluginLoadResult {
  readonly ok: boolean;
  readonly manifest: CliPluginManifest | undefined;
  readonly module: CliPluginModule | undefined;
  readonly diagnostics: readonly CliDiagnostic[];
}

export interface CliPluginHookRunInput {
  readonly payload?: CliPluginPayload;
}

export interface CliPluginHookRunResult {
  readonly event: CliPluginHookEvent;
  readonly ok: boolean;
  readonly hooks: readonly CliPluginHookResult[];
  readonly diagnostics: readonly CliDiagnostic[];
}

export interface CliPluginHookResult {
  readonly pluginName: string;
  readonly hookName: string;
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly effects: readonly CliPluginEffect[];
  readonly diagnostics: readonly CliDiagnostic[];
}

const allRuntimes: readonly CliPluginRuntime[] = Object.freeze(['node', 'deno', 'bun']);

export function defineCliPluginManifest(definition: CliPluginManifestDefinition | CliPluginManifest): CliPluginManifest {
  const hooks = Object.freeze(
    (definition.hooks ?? []).map((hook) =>
      Object.freeze({
        name: hook.name,
        event: hook.event,
        order: hook.order ?? 0,
        before: Object.freeze([...(hook.before ?? [])]),
        after: Object.freeze([...(hook.after ?? [])])
      })
    )
  );

  return Object.freeze({
    schemaVersion: 'cli-core.plugin.v1',
    name: definition.name,
    version: definition.version,
    cliCore: freezePluginValue(definition.cliCore ?? {}),
    runtimes: Object.freeze([...(definition.runtimes ?? allRuntimes)]),
    capabilities: Object.freeze([...(definition.capabilities ?? [])]),
    commands: freezePluginValue(definition.commands ?? []),
    hooks
  }) as CliPluginManifest;
}

export function checkCliPluginCompatibility(
  manifestInput: CliPluginManifestDefinition | CliPluginManifest,
  input: CliPluginHostInput = {}
): CliPluginCompatibilityResult {
  const manifest = defineCliPluginManifest(manifestInput);
  const cliCoreVersion = input.cliCoreVersion ?? cliCorePackage.version;
  const runtime = input.runtime ?? 'node';
  const diagnostics = Object.freeze([
    ...manifestDiagnostics(manifest),
    ...versionDiagnostics(manifest, cliCoreVersion),
    ...runtimeDiagnostics(manifest, runtime),
    ...capabilityDiagnostics(manifest, input.allowedCapabilities)
  ]);

  return Object.freeze({
    ok: !hasErrorDiagnostics(diagnostics),
    manifest,
    diagnostics
  });
}

export function applyCliPluginCommands(
  target: CliDefinition | CliProgram,
  plugins: readonly (CliPluginManifestDefinition | CliPluginManifest)[],
  input: CliPluginCommandApplicationInput = {}
): CliPluginCommandApplication {
  const baseDefinition = isCliProgram(target) ? definitionFromProgram(target) : cloneDefinition(target);
  const acceptedCommands: CliCommandDefinition[] = [];
  const contributions: CliPluginCommandContribution[] = [];
  const diagnostics: CliDiagnostic[] = [];
  const commandPaths = new Set<string>();
  const aliasPaths = new Set<string>();

  for (const command of baseDefinition.commands ?? []) {
    indexDefinitionTree(command, [], commandPaths, aliasPaths);
  }

  for (const pluginInput of plugins) {
    const compatibility = checkCliPluginCompatibility(pluginInput, input);
    const manifest = compatibility.manifest;
    diagnostics.push(...compatibility.diagnostics);
    if (!compatibility.ok) {
      if (manifest.commands.length > 0) {
        diagnostics.push(pluginDiagnostic('CLI_PLUGIN_COMMAND_REJECTED', 'Plugin command contributions were rejected by compatibility checks.', {
          pluginName: manifest.name,
          pluginVersion: manifest.version
        }));
      }
      continue;
    }

    const acceptedForPlugin: CliCommandDefinition[] = [];
    for (const command of manifest.commands) {
      const indexed = collectDefinitionTree(command, []);
      const conflict = firstCommandConflict(indexed, commandPaths, aliasPaths);
      if (conflict !== undefined) {
        diagnostics.push(pluginDiagnostic('CLI_PLUGIN_COMMAND_CONFLICT', 'Plugin command contribution conflicts with an existing command path or alias.', {
          pluginName: manifest.name,
          pluginVersion: manifest.version,
          path: conflict.path,
          conflictKind: conflict.kind
        }));
        continue;
      }

      const sourced = cloneCommandDefinition(command, {
        kind: 'plugin',
        pluginName: manifest.name,
        pluginVersion: manifest.version
      });
      acceptedForPlugin.push(sourced);
      for (const path of indexed.commandPaths) commandPaths.add(pathKey(path));
      for (const path of indexed.aliasPaths) aliasPaths.add(pathKey(path));
    }

    if (acceptedForPlugin.length > 0) {
      acceptedCommands.push(...acceptedForPlugin);
      const acceptedIndex = acceptedForPlugin.reduce<CollectedCommandPaths>(
        (collected, command) => mergeCollectedPaths(collected, collectDefinitionTree(command, [])),
        emptyCollectedPaths()
      );
      contributions.push(Object.freeze({
        pluginName: manifest.name,
        pluginVersion: manifest.version,
        commandPaths: freezePaths(acceptedIndex.commandPaths),
        aliasPaths: freezePaths(acceptedIndex.aliasPaths)
      }));
    }
  }

  const definition = freezeDefinition({
    ...baseDefinition,
    commands: Object.freeze([...(baseDefinition.commands ?? []), ...acceptedCommands])
  });
  const program = defineCli(definition);
  const allDiagnostics = Object.freeze([...diagnostics, ...program.diagnostics]);

  return Object.freeze({
    schemaVersion: 'cli-core.plugin-command-application.v1',
    ok: !hasErrorDiagnostics(allDiagnostics),
    definition,
    program,
    contributions: Object.freeze(contributions),
    diagnostics: allDiagnostics
  });
}

export function createCliPluginHost(
  registrations: readonly CliPluginRegistration[],
  input: CliPluginHostInput = {}
): CliPluginHost {
  const records: PluginRecord[] = [];
  const byName = new Map<string, PluginRecord>();
  const loadCache = new Map<string, Promise<CliPluginLoadResult>>();
  const diagnostics: CliDiagnostic[] = [];

  for (const registration of registrations) {
    const compatibility = checkCliPluginCompatibility(registration.manifest, input);
    const record = Object.freeze({
      manifest: compatibility.manifest,
      registration,
      compatibility
    });

    if (byName.has(record.manifest.name)) {
      diagnostics.push(pluginDiagnostic('CLI_PLUGIN_DUPLICATE_NAME', 'Plugin name is already registered.', {
        pluginName: record.manifest.name
      }));
      continue;
    }

    records.push(record);
    byName.set(record.manifest.name, record);
    diagnostics.push(...compatibility.diagnostics);
  }

  const manifestSnapshot = Object.freeze(records.map((record) => record.manifest));
  const diagnosticSnapshot = Object.freeze([...diagnostics]);
  const loadPluginByName = (name: string): Promise<CliPluginLoadResult> => {
    const cached = loadCache.get(name);
    if (cached !== undefined) return cached;
    const record = byName.get(name);
    const loadPromise = record === undefined
      ? Promise.resolve(missingPluginLoadResult(name))
      : loadPluginRecord(record);
    loadCache.set(name, loadPromise);
    return loadPromise;
  };

  return Object.freeze({
    manifests: manifestSnapshot,
    diagnostics: diagnosticSnapshot,
    checkPlugin(name: string): CliPluginCompatibilityResult | undefined {
      return byName.get(name)?.compatibility;
    },
    planHooks(event: CliPluginHookEvent): CliPluginHookPlan {
      return planPluginHooks(records, event);
    },
    loadPlugin: loadPluginByName,
    async runHooks(event: CliPluginHookEvent, context: CliPluginHookRunInput = {}): Promise<CliPluginHookRunResult> {
      const plan = planPluginHooks(records, event);
      if (hasErrorDiagnostics(plan.diagnostics)) {
        return hookRunResult(event, [], plan.diagnostics);
      }

      const hookResults: CliPluginHookResult[] = [];
      for (const hook of plan.hooks) {
        const loaded = await loadPluginByName(hook.pluginName);
        if (!loaded.ok || loaded.module === undefined) {
          hookResults.push(hookResult(hook, 'failed', [], loaded.diagnostics));
          continue;
        }

        const handler = loaded.module.hooks?.[hook.hookName];
        if (handler === undefined) {
          hookResults.push(
            hookResult(hook, 'failed', [], [
              pluginDiagnostic('CLI_PLUGIN_HOOK_MISSING', 'Plugin module did not expose the declared hook.', {
                pluginName: hook.pluginName,
                hookName: hook.hookName,
                event
              })
            ])
          );
          continue;
        }

        hookResults.push(await runPluginHook(hook, handler, context));
      }

      return hookRunResult(event, hookResults, plan.diagnostics);
    }
  });
}

interface PluginRecord {
  readonly manifest: CliPluginManifest;
  readonly registration: CliPluginRegistration;
  readonly compatibility: CliPluginCompatibilityResult;
}

interface HookNode {
  readonly id: string;
  readonly pluginName: string;
  readonly hook: CliPluginHookDefinition;
  readonly manifestIndex: number;
  readonly hookIndex: number;
}

interface CollectedCommandPaths {
  readonly commandPaths: readonly (readonly string[])[];
  readonly aliasPaths: readonly (readonly string[])[];
}

interface CommandConflict {
  readonly kind: 'command_path' | 'alias_path';
  readonly path: readonly string[];
}

function isCliProgram(target: CliDefinition | CliProgram): target is CliProgram {
  return 'schemaVersion' in target && target.schemaVersion === 'cli-core.program.v1';
}

function definitionFromProgram(program: CliProgram): CliDefinition {
  const fields: {
    version?: string;
    description?: string;
    config?: NonNullable<CliDefinition['config']>;
    options?: readonly CliOptionDefinition[];
    commands?: readonly CliCommandDefinition[];
  } = {};
  if (program.version !== undefined) fields.version = program.version;
  if (program.description !== undefined) fields.description = program.description;
  if (program.config !== undefined) fields.config = program.config;
  fields.options = program.root.inheritedOptions.map(optionToDefinition);
  fields.commands = findCliCommandChildren(program, program.root.id).map((command) => commandToDefinition(command, program));
  return freezeDefinition({ name: program.name, ...fields });
}

function commandToDefinition(command: CliCommand, program: CliProgram): CliCommandDefinition {
  const fields: {
    aliases?: readonly CliAliasInput[];
    description?: string;
    deprecated?: boolean | string;
    source?: NonNullable<CliCommandDefinition['source']>;
    positionals?: readonly CliPositionalDefinition[];
    options?: readonly CliOptionDefinition[];
    commands?: readonly CliCommandDefinition[];
    allowPassThrough?: boolean;
  } = {};
  if (command.aliases.length > 0) {
    fields.aliases = command.aliases.map((alias) => alias.deprecated === undefined ? alias.name : {
      name: alias.name,
      deprecated: alias.deprecated
    });
  }
  if (command.description !== undefined) fields.description = command.description;
  if (command.deprecated !== undefined) fields.deprecated = command.deprecated;
  fields.source = command.source;
  if (command.positionals.length > 0) fields.positionals = command.positionals.map(positionalToDefinition);
  if (command.options.length > 0) fields.options = command.options.map(optionToDefinition);
  if (command.allowPassThrough) fields.allowPassThrough = command.allowPassThrough;
  const childCommands = findCliCommandChildren(program, command.id).map((candidate) => commandToDefinition(candidate, program));
  if (childCommands.length > 0) fields.commands = childCommands;
  return cloneCommandDefinition({ name: command.name, ...fields }, command.source);
}

function cloneDefinition(definition: CliDefinition): CliDefinition {
  const fields: {
    version?: string;
    description?: string;
    config?: NonNullable<CliDefinition['config']>;
    options?: readonly CliOptionDefinition[];
    commands?: readonly CliCommandDefinition[];
  } = {};
  if (definition.version !== undefined) fields.version = definition.version;
  if (definition.description !== undefined) fields.description = definition.description;
  if (definition.config !== undefined) fields.config = definition.config;
  if (definition.options !== undefined) fields.options = definition.options.map(optionToDefinition);
  if (definition.commands !== undefined) {
    fields.commands = definition.commands.map((command) => cloneCommandDefinition(command, command.source ?? { kind: 'definition' }));
  }
  return freezeDefinition({ name: definition.name, ...fields });
}

function freezeDefinition(definition: CliDefinition): CliDefinition {
  const optionalFields: {
    version?: string;
    description?: string;
    config?: NonNullable<CliDefinition['config']>;
    options?: readonly CliOptionDefinition[];
    commands?: CliDefinition['commands'];
  } = {};
  if (definition.version !== undefined) optionalFields.version = definition.version;
  if (definition.description !== undefined) optionalFields.description = definition.description;
  if (definition.config !== undefined) optionalFields.config = freezePluginValue(definition.config);
  if (definition.options !== undefined) optionalFields.options = Object.freeze(definition.options.map(optionToDefinition));
  if (definition.commands !== undefined) {
    optionalFields.commands = Object.freeze(definition.commands.map((command) => cloneCommandDefinition(command, command.source ?? { kind: 'definition' })));
  }
  return Object.freeze({ name: definition.name, ...optionalFields }) as CliDefinition;
}

function cloneCommandDefinition(
  command: CliCommandDefinition,
  source: NonNullable<CliCommandDefinition['source']>
): CliCommandDefinition {
  const optionalFields: {
    aliases?: readonly CliAliasInput[];
    description?: string;
    deprecated?: boolean | string;
    source?: NonNullable<CliCommandDefinition['source']>;
    positionals?: CliCommandDefinition['positionals'];
    options?: readonly CliOptionDefinition[];
    commands?: CliCommandDefinition['commands'];
    allowPassThrough?: boolean;
  } = {};
  if (command.aliases !== undefined) optionalFields.aliases = Object.freeze(command.aliases.map(cloneAliasInput));
  if (command.description !== undefined) optionalFields.description = command.description;
  if (command.deprecated !== undefined) optionalFields.deprecated = command.deprecated;
  optionalFields.source = Object.freeze({ ...source });
  if (command.positionals !== undefined) {
    optionalFields.positionals = Object.freeze(command.positionals.map((positional) => Object.freeze({ ...positional })));
  }
  if (command.options !== undefined) optionalFields.options = Object.freeze(command.options.map(optionToDefinition));
  if (command.commands !== undefined) {
    optionalFields.commands = Object.freeze(command.commands.map((child) => cloneCommandDefinition(child, source)));
  }
  if (command.allowPassThrough !== undefined) optionalFields.allowPassThrough = command.allowPassThrough;
  return Object.freeze({ name: command.name, ...optionalFields }) as CliCommandDefinition;
}

function cloneAliasInput(alias: CliAliasInput): CliAliasInput {
  return typeof alias === 'string' ? alias : Object.freeze({ ...alias });
}

function optionToDefinition(option: CliOption | CliOptionDefinition): CliOptionDefinition {
  const optionalFields: {
    description?: string;
    required?: boolean;
    default?: CliOptionDefinition['default'];
    allowEmpty?: boolean;
    allowNo?: boolean;
    hidden?: boolean;
  } = {};
  if (option.description !== undefined) optionalFields.description = option.description;
  if (option.required !== undefined) optionalFields.required = option.required;
  if (option.default !== undefined) {
    optionalFields.default = Array.isArray(option.default) ? [...option.default] : option.default;
  }
  if (option.allowEmpty !== undefined) optionalFields.allowEmpty = option.allowEmpty;
  if (option.allowNo !== undefined) optionalFields.allowNo = option.allowNo;
  if (option.hidden !== undefined) optionalFields.hidden = option.hidden;
  return Object.freeze({
    name: option.name,
    type: option.type,
    flags: Object.freeze([...option.flags]),
    ...optionalFields
  }) as CliOptionDefinition;
}

function positionalToDefinition(positional: CliPositional): CliPositionalDefinition {
  return Object.freeze({ ...positional });
}

function indexDefinitionTree(
  command: CliCommandDefinition,
  parentPath: readonly string[],
  commandPaths: Set<string>,
  aliasPaths: Set<string>
): void {
  const collected = collectDefinitionTree(command, parentPath);
  for (const path of collected.commandPaths) commandPaths.add(pathKey(path));
  for (const path of collected.aliasPaths) aliasPaths.add(pathKey(path));
}

function collectDefinitionTree(command: CliCommandDefinition, parentPath: readonly string[]): CollectedCommandPaths {
  const path = Object.freeze([...parentPath, command.name]);
  const commandPaths: (readonly string[])[] = [path];
  const aliasPaths: (readonly string[])[] = (command.aliases ?? []).map((alias) =>
    Object.freeze([...parentPath, typeof alias === 'string' ? alias : alias.name])
  );

  for (const child of command.commands ?? []) {
    const childPaths = collectDefinitionTree(child, path);
    commandPaths.push(...childPaths.commandPaths);
    aliasPaths.push(...childPaths.aliasPaths);
  }

  return Object.freeze({
    commandPaths: freezePaths(commandPaths),
    aliasPaths: freezePaths(aliasPaths)
  });
}

function firstCommandConflict(
  collected: CollectedCommandPaths,
  commandPaths: ReadonlySet<string>,
  aliasPaths: ReadonlySet<string>
): CommandConflict | undefined {
  const seenCommands = new Set<string>();
  const seenAliases = new Set<string>();
  for (const path of collected.commandPaths) {
    const key = pathKey(path);
    if (seenCommands.has(key) || commandPaths.has(key) || aliasPaths.has(key)) {
      return { kind: 'command_path', path };
    }
    seenCommands.add(key);
  }
  for (const path of collected.aliasPaths) {
    const key = pathKey(path);
    if (seenAliases.has(key) || seenCommands.has(key) || commandPaths.has(key) || aliasPaths.has(key)) {
      return { kind: 'alias_path', path };
    }
    seenAliases.add(key);
  }
  return undefined;
}

function emptyCollectedPaths(): CollectedCommandPaths {
  return Object.freeze({
    commandPaths: Object.freeze([]),
    aliasPaths: Object.freeze([])
  });
}

function mergeCollectedPaths(left: CollectedCommandPaths, right: CollectedCommandPaths): CollectedCommandPaths {
  return Object.freeze({
    commandPaths: freezePaths([...left.commandPaths, ...right.commandPaths]),
    aliasPaths: freezePaths([...left.aliasPaths, ...right.aliasPaths])
  });
}

function freezePaths(paths: readonly (readonly string[])[]): readonly (readonly string[])[] {
  return Object.freeze(paths.map((path) => Object.freeze([...path])));
}

function pathKey(path: readonly string[]): string {
  return path.join('\u0000');
}

function manifestDiagnostics(manifest: CliPluginManifest): readonly CliDiagnostic[] {
  const diagnostics: CliDiagnostic[] = [];
  if (manifest.name.trim().length === 0) {
    diagnostics.push(pluginDiagnostic('CLI_PLUGIN_INVALID_MANIFEST', 'Plugin name is required.', {
      pluginName: manifest.name
    }));
  }
  if (manifest.version.trim().length === 0) {
    diagnostics.push(pluginDiagnostic('CLI_PLUGIN_INVALID_MANIFEST', 'Plugin version is required.', {
      pluginName: manifest.name
    }));
  }

  const hookNames = new Set<string>();
  for (const hook of manifest.hooks) {
    if (hook.name.trim().length === 0) {
      diagnostics.push(pluginDiagnostic('CLI_PLUGIN_INVALID_MANIFEST', 'Plugin hook name is required.', {
        pluginName: manifest.name,
        event: hook.event
      }));
      continue;
    }
    if (hookNames.has(hook.name)) {
      diagnostics.push(pluginDiagnostic('CLI_PLUGIN_INVALID_MANIFEST', 'Plugin hook name must be unique.', {
        pluginName: manifest.name,
        hookName: hook.name
      }));
    }
    hookNames.add(hook.name);
  }

  return Object.freeze(diagnostics);
}

function versionDiagnostics(manifest: CliPluginManifest, cliCoreVersion: string): readonly CliDiagnostic[] {
  const diagnostics: CliDiagnostic[] = [];
  if (manifest.cliCore.minVersion !== undefined && compareVersions(cliCoreVersion, manifest.cliCore.minVersion) < 0) {
    diagnostics.push(pluginDiagnostic('CLI_PLUGIN_CORE_VERSION_UNSUPPORTED', 'Plugin requires a newer cli-core version.', {
      pluginName: manifest.name,
      pluginVersion: manifest.version,
      cliCoreVersion,
      minVersion: manifest.cliCore.minVersion
    }));
  }
  if (manifest.cliCore.maxVersion !== undefined && compareVersions(cliCoreVersion, manifest.cliCore.maxVersion) > 0) {
    diagnostics.push(pluginDiagnostic('CLI_PLUGIN_CORE_VERSION_UNSUPPORTED', 'Plugin does not support this cli-core version.', {
      pluginName: manifest.name,
      pluginVersion: manifest.version,
      cliCoreVersion,
      maxVersion: manifest.cliCore.maxVersion
    }));
  }
  return Object.freeze(diagnostics);
}

function runtimeDiagnostics(manifest: CliPluginManifest, runtime: CliPluginRuntime): readonly CliDiagnostic[] {
  if (manifest.runtimes.includes(runtime)) return [];
  return [
    pluginDiagnostic('CLI_PLUGIN_RUNTIME_UNSUPPORTED', 'Plugin does not support the selected runtime.', {
      pluginName: manifest.name,
      runtime,
      supportedRuntimes: manifest.runtimes
    })
  ];
}

function capabilityDiagnostics(
  manifest: CliPluginManifest,
  allowedCapabilities: readonly string[] | undefined
): readonly CliDiagnostic[] {
  if (allowedCapabilities === undefined) return [];
  const allowed = new Set(allowedCapabilities);
  const blocked = manifest.capabilities.filter((capability) => !allowed.has(capability));
  if (blocked.length === 0) return [];
  return [
    pluginDiagnostic('CLI_PLUGIN_CAPABILITY_BLOCKED', 'Plugin declares capabilities outside the allowed set.', {
      pluginName: manifest.name,
      capabilities: blocked
    })
  ];
}

function planPluginHooks(records: readonly PluginRecord[], event: CliPluginHookEvent): CliPluginHookPlan {
  const compatibleRecords = records.filter((record) => record.compatibility.ok);
  const nodes = compatibleRecords.flatMap((record, manifestIndex) =>
    record.manifest.hooks
      .map((hook, hookIndex) => ({ id: hookId(record.manifest.name, hook.name), pluginName: record.manifest.name, hook, manifestIndex, hookIndex }))
      .filter((node) => node.hook.event === event)
  );
  const ordered = orderHookNodes(nodes);
  return Object.freeze({
    event,
    hooks: Object.freeze(ordered.nodes.map(hookReference)),
    diagnostics: ordered.diagnostics
  });
}

function orderHookNodes(nodes: readonly HookNode[]): {
  readonly nodes: readonly HookNode[];
  readonly diagnostics: readonly CliDiagnostic[];
} {
  const baseOrder = [...nodes].sort(compareHookNode);
  const byId = new Map(baseOrder.map((node) => [node.id, node]));
  const edges = new Map(baseOrder.map((node) => [node.id, new Set<string>()]));
  const incoming = new Map(baseOrder.map((node) => [node.id, 0]));

  // Hook ordering is graph-based: explicit before/after references override
  // declaration order, unknown references are ignored, and cycles become typed
  // diagnostics instead of partially ordered side effects.
  for (const node of baseOrder) {
    for (const before of resolveHookReferences(node.hook.before, byId)) {
      addHookEdge(node.id, before.id, edges, incoming);
    }
    for (const after of resolveHookReferences(node.hook.after, byId)) {
      addHookEdge(after.id, node.id, edges, incoming);
    }
  }

  const ready = baseOrder.filter((node) => incoming.get(node.id) === 0);
  const ordered: HookNode[] = [];
  while (ready.length > 0) {
    ready.sort(compareHookNode);
    const node = ready.shift();
    if (node === undefined) break;
    ordered.push(node);
    for (const targetId of edges.get(node.id) ?? []) {
      const count = (incoming.get(targetId) ?? 0) - 1;
      incoming.set(targetId, count);
      if (count === 0) {
        const target = byId.get(targetId);
        if (target !== undefined) ready.push(target);
      }
    }
  }

  if (ordered.length === baseOrder.length) {
    return { nodes: Object.freeze(ordered), diagnostics: Object.freeze([]) };
  }

  return {
    nodes: Object.freeze(baseOrder),
    diagnostics: Object.freeze([
      pluginDiagnostic('CLI_PLUGIN_HOOK_ORDER_CYCLE', 'Plugin hook ordering contains a cycle.', {
        hooks: baseOrder.map((node) => node.id)
      })
    ])
  };
}

function resolveHookReferences(
  references: readonly string[],
  byId: ReadonlyMap<string, HookNode>
): readonly HookNode[] {
  const resolved: HookNode[] = [];
  for (const reference of references) {
    const direct = byId.get(reference);
    if (direct !== undefined) {
      resolved.push(direct);
      continue;
    }
    for (const node of byId.values()) {
      if (node.pluginName === reference) resolved.push(node);
    }
  }
  return Object.freeze(resolved);
}

function addHookEdge(
  from: string,
  to: string,
  edges: Map<string, Set<string>>,
  incoming: Map<string, number>
): void {
  if (from === to) return;
  const targets = edges.get(from);
  if (targets === undefined || targets.has(to)) return;
  targets.add(to);
  incoming.set(to, (incoming.get(to) ?? 0) + 1);
}

async function loadPluginRecord(record: PluginRecord): Promise<CliPluginLoadResult> {
  if (!record.compatibility.ok) {
    return loadResult(false, record.manifest, undefined, record.compatibility.diagnostics);
  }

  try {
    const module = await record.registration.load();
    const moduleDiagnostics = moduleManifestDiagnostics(record.manifest, module);
    return loadResult(!hasErrorDiagnostics(moduleDiagnostics), record.manifest, module, moduleDiagnostics);
  } catch (error) {
    return loadResult(false, record.manifest, undefined, [
      pluginDiagnostic('CLI_PLUGIN_LOAD_FAILED', 'Plugin loader failed.', {
        pluginName: record.manifest.name,
        errorMessage: errorMessage(error)
      })
    ]);
  }
}

function moduleManifestDiagnostics(
  manifest: CliPluginManifest,
  module: CliPluginModule
): readonly CliDiagnostic[] {
  if (module.manifest === undefined) return [];
  if (module.manifest.name === manifest.name && module.manifest.version === manifest.version) return [];
  return [
    pluginDiagnostic('CLI_PLUGIN_MODULE_MANIFEST_MISMATCH', 'Loaded plugin module manifest does not match registration manifest.', {
      pluginName: manifest.name,
      moduleName: module.manifest.name,
      pluginVersion: manifest.version,
      moduleVersion: module.manifest.version
    })
  ];
}

async function runPluginHook(
  hook: CliPluginHookReference,
  handler: CliPluginHookHandler,
  input: CliPluginHookRunInput
): Promise<CliPluginHookResult> {
  try {
    const output = await handler(Object.freeze({
      event: hook.event,
      pluginName: hook.pluginName,
      hookName: hook.hookName,
      payload: freezePluginValue(input.payload ?? null)
    }));
    const effects = Object.freeze([...(output?.effects ?? [])].map((effect) => freezePluginValue(effect)));
    const diagnostics = Object.freeze([...(output?.diagnostics ?? [])]);
    return hookResult(hook, hasErrorDiagnostics(diagnostics) ? 'failed' : 'passed', effects, diagnostics);
  } catch (error) {
    return hookResult(hook, 'failed', [], [
      pluginDiagnostic('CLI_PLUGIN_HOOK_FAILED', 'Plugin hook failed.', {
        pluginName: hook.pluginName,
        hookName: hook.hookName,
        errorMessage: errorMessage(error)
      })
    ]);
  }
}

function hookReference(node: HookNode): CliPluginHookReference {
  return Object.freeze({
    id: node.id,
    pluginName: node.pluginName,
    hookName: node.hook.name,
    event: node.hook.event,
    order: node.hook.order
  });
}

function hookResult(
  hook: CliPluginHookReference,
  status: CliPluginHookResult['status'],
  effects: readonly CliPluginEffect[],
  diagnostics: readonly CliDiagnostic[]
): CliPluginHookResult {
  return Object.freeze({
    pluginName: hook.pluginName,
    hookName: hook.hookName,
    status,
    effects: Object.freeze([...effects]),
    diagnostics: Object.freeze([...diagnostics])
  });
}

function hookRunResult(
  event: CliPluginHookEvent,
  hooks: readonly CliPluginHookResult[],
  diagnostics: readonly CliDiagnostic[]
): CliPluginHookRunResult {
  const allDiagnostics = Object.freeze([
    ...diagnostics,
    ...hooks.flatMap((hook) => hook.diagnostics)
  ]);
  return Object.freeze({
    event,
    ok: !hasErrorDiagnostics(allDiagnostics),
    hooks: Object.freeze([...hooks]),
    diagnostics: allDiagnostics
  });
}

function loadResult(
  ok: boolean,
  manifest: CliPluginManifest | undefined,
  module: CliPluginModule | undefined,
  diagnostics: readonly CliDiagnostic[]
): CliPluginLoadResult {
  return Object.freeze({
    ok,
    manifest,
    module,
    diagnostics: Object.freeze([...diagnostics])
  });
}

function missingPluginLoadResult(pluginName: string): CliPluginLoadResult {
  return loadResult(false, undefined, undefined, [
    pluginDiagnostic('CLI_PLUGIN_INVALID_MANIFEST', 'Plugin is not registered.', { pluginName })
  ]);
}

function pluginDiagnostic(
  code: CliDiagnostic['code'],
  message: string,
  fields: Readonly<Record<string, CliDiagnosticValue>>
): CliDiagnostic {
  return createCliDiagnostic(code, 'error', message, fields);
}

function hookId(pluginName: string, hookName: string): string {
  return `${pluginName}:${hookName}`;
}

function compareHookNode(left: HookNode, right: HookNode): number {
  return left.hook.order - right.hook.order ||
    left.manifestIndex - right.manifestIndex ||
    left.hookIndex - right.hookIndex ||
    left.id.localeCompare(right.id);
}

function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    const leftPart = leftParts.at(index) ?? 0;
    const rightPart = rightParts.at(index) ?? 0;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return 0;
}

function versionParts(version: string): readonly number[] {
  return Object.freeze(
    version
      .split(/[.-]/)
      .slice(0, 3)
      .map((part) => Number.parseInt(part, 10))
      .map((part) => Number.isFinite(part) ? part : 0)
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Unknown plugin error.';
}

function freezePluginValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => freezePluginValue(item))) as T;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, entryValue]) => [key, freezePluginValue(entryValue)] as const);
    return Object.freeze(Object.fromEntries(entries)) as T;
  }
  return value;
}
