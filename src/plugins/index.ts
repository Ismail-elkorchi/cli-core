import type { CliCommandDefinition } from '../command/index.js';
import {
  createCliDiagnostic,
  hasErrorDiagnostics,
  type CliDiagnostic,
  type CliDiagnosticValue
} from '../diagnostics.js';
import { cliCorePackage } from '../package.js';

export { cliCorePackage };
export type { CliCorePackage } from '../package.js';

export type CliPluginRuntime = 'node' | 'deno' | 'bun';

export type CliPluginHookEvent =
  | 'init'
  | 'preparse'
  | 'prerun'
  | 'postrun'
  | 'finally'
  | 'command_not_found';

export type CliPluginData = CliDiagnosticValue;

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
  readonly data: CliPluginData;
}

export interface CliPluginHookOutput {
  readonly effects?: readonly CliPluginEffect[];
  readonly diagnostics?: readonly CliDiagnostic[];
}

export interface CliPluginEffect {
  readonly kind: string;
  readonly data?: CliPluginData;
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
  readonly data?: CliPluginData;
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
      data: freezePluginValue(input.data ?? null)
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
