import { defineCli, type CliDefinition } from '../command/index.ts';
import { resolveCliConfig, type ConfigInput, type ConfigValue } from '../config/index.ts';
import type { CliDiagnosticCode } from '../diagnostics.ts';
import { parseCli } from '../parse/index.ts';
import { applyCliPluginCommands, type CliPluginManifest, type CliPluginManifestDefinition } from '../plugins/index.ts';
import { runCli, type ExitKind, type RunArtifact, type RunEffect, type RunMode, type RunPayload } from '../run/index.ts';

export type CliFixtureValue =
  | null
  | boolean
  | number
  | string
  | readonly CliFixtureValue[]
  | { readonly [key: string]: CliFixtureValue };

export type CliFixtureFamily = 'commands' | 'config' | 'plugins' | 'runs';

export interface CliFixtureDefinition {
  readonly id: string;
  readonly family: CliFixtureFamily;
  readonly title: string;
  readonly description?: string;
  readonly capabilities: readonly string[];
  readonly value?: CliFixtureValue;
}

export interface CliFixture {
  readonly id: string;
  readonly family: CliFixtureFamily;
  readonly title: string;
  readonly description?: string;
  readonly capabilities: readonly string[];
  readonly value: CliFixtureValue;
}

export interface LargeCommandFixtureInput {
  readonly id?: string;
  readonly commandCount?: number;
  readonly programName?: string;
}

export interface CliFixtureRegistry {
  readonly get: (id: string) => CliFixture | undefined;
  readonly has: (id: string) => boolean;
  readonly list: (family?: CliFixtureFamily) => readonly CliFixture[];
  readonly snapshot: () => readonly CliFixture[];
}

export type CliPackageEntrypoint =
  | 'root'
  | 'adapter'
  | 'help'
  | 'completion'
  | 'manifest'
  | 'config'
  | 'effects'
  | 'plugins'
  | 'repair'
  | 'schema'
  | 'testing';

export interface CliEntrypointModule {
  readonly [exportName: string]: unknown;
}

export interface CliHarnessInput {
  readonly program?: unknown;
  readonly entrypoints?: Partial<Record<CliPackageEntrypoint, CliEntrypointModule>>;
  readonly fixtures?: readonly CliFixtureDefinition[];
}

export interface CliHarness {
  readonly program: unknown | undefined;
  readonly fixtures: CliFixtureRegistry;
  readonly getEntrypoint: (entrypoint: CliPackageEntrypoint) => CliEntrypointModule | undefined;
}

export interface CliScenario {
  readonly id: string;
  readonly title?: string;
  readonly steps: readonly CliScenarioStep[];
}

export type CliScenarioStep =
  | CliEntrypointLoadStep
  | CliFixtureAvailableStep
  | CliParseScenarioStep
  | CliConfigScenarioStep
  | CliPluginCommandScenarioStep
  | CliRunScenarioStep;

export interface CliEntrypointLoadStep {
  readonly kind: 'entrypoint-load';
  readonly name: string;
  readonly entrypoint: CliPackageEntrypoint;
  readonly expectedExports?: readonly string[];
}

export interface CliFixtureAvailableStep {
  readonly kind: 'fixture-available';
  readonly name: string;
  readonly fixtureId: string;
  readonly expectedFamily?: CliFixtureFamily;
}

export interface CliParseScenarioStep {
  readonly kind: 'parse';
  readonly name: string;
  readonly definition: CliDefinition;
  readonly argv?: readonly string[];
  readonly expectedOk?: boolean;
  readonly expectedCommandPath?: readonly string[];
  readonly expectedDiagnosticCodes?: readonly CliDiagnosticCode[];
}

export interface CliConfigScenarioStep {
  readonly kind: 'config-resolution';
  readonly name: string;
  readonly definition: CliDefinition;
  readonly input?: ConfigInput;
  readonly expectedOk?: boolean;
  readonly expectedValues?: Readonly<Record<string, ConfigValue>>;
  readonly expectedDiagnosticCodes?: readonly CliDiagnosticCode[];
}

export interface CliPluginCommandScenarioStep {
  readonly kind: 'plugin-command-application';
  readonly name: string;
  readonly definition: CliDefinition;
  readonly plugins: readonly (CliPluginManifestDefinition | CliPluginManifest)[];
  readonly expectedOk?: boolean;
  readonly expectedCommandPaths?: readonly (readonly string[])[];
  readonly expectedDiagnosticCodes?: readonly CliDiagnosticCode[];
}

export interface CliRunScenarioStep {
  readonly kind: 'run';
  readonly name: string;
  readonly definition: CliDefinition;
  readonly argv?: readonly string[];
  readonly mode?: RunMode;
  readonly effects?: readonly RunEffect[];
  readonly artifacts?: readonly RunArtifact[];
  readonly context?: RunPayload;
  readonly cancelled?: boolean;
  readonly interrupted?: boolean;
  readonly timeoutMs?: number;
  readonly elapsedMs?: number;
  readonly expectedOk?: boolean;
  readonly expectedExitKind?: ExitKind;
  readonly expectedEventNames?: readonly string[];
  readonly expectedDiagnosticCodes?: readonly CliDiagnosticCode[];
}

export type CliScenarioStatus = 'passed' | 'failed';

export type CliTestDiagnosticCode =
  | 'CLI_TEST_DUPLICATE_FIXTURE'
  | 'CLI_TEST_ENTRYPOINT_MISSING'
  | 'CLI_TEST_EXPORT_MISSING'
  | 'CLI_TEST_FIXTURE_MISSING'
  | 'CLI_TEST_FIXTURE_FAMILY_MISMATCH'
  | 'CLI_TEST_EXPECTATION_FAILED';

export interface CliTestDiagnostic {
  readonly code: CliTestDiagnosticCode;
  readonly message: string;
  readonly fields: Readonly<Record<string, CliFixtureValue>>;
}

export interface CliScenarioStepResult {
  readonly index: number;
  readonly name: string;
  readonly kind: CliScenarioStep['kind'];
  readonly status: CliScenarioStatus;
  readonly diagnostics: readonly CliTestDiagnostic[];
}

export interface CliScenarioResult {
  readonly scenarioId: string;
  readonly status: CliScenarioStatus;
  readonly steps: readonly CliScenarioStepResult[];
  readonly diagnostics: readonly CliTestDiagnostic[];
}

// Stryker disable all: built-in fixture corpus is static sample data; behavior tests cover public consumers and selected generated fixtures, not exact inventory strings.
export const commandFixtures: readonly CliFixture[] = Object.freeze([
  defineCliFixture({
    id: 'commands.minimal-program',
    family: 'commands',
    title: 'Minimal command program',
    capabilities: ['command.definition', 'command.compilation'],
    value: {
      name: 'minimal',
      commands: [{ name: 'run' }]
    }
  }),
  defineCliFixture({
    id: 'commands.tree-program',
    family: 'commands',
    title: 'Nested command tree',
    capabilities: ['command.paths', 'command.aliases', 'options.global', 'options.local'],
    value: {
      name: 'tree',
      options: [{ name: 'verbose', type: 'boolean', flags: ['--verbose', '-v'] }],
      commands: [
        {
          name: 'build',
          aliases: ['b'],
          options: [{ name: 'mode', type: 'string', flags: ['--mode'] }],
          positionals: [{ name: 'target', required: false }]
        },
        {
          name: 'deploy',
          commands: [
            {
              name: 'production',
              aliases: ['prod'],
              positionals: [{ name: 'service' }]
            }
          ]
        }
      ]
    }
  }),
  defineCliFixture({
    id: 'commands.repair-program',
    family: 'commands',
    title: 'Repair-oriented command names',
    capabilities: ['command.lookup', 'repair.unknown-command'],
    value: {
      name: 'repair',
      commands: [{ name: 'install', aliases: ['i'] }, { name: 'inspect' }, { name: 'init' }]
    }
  }),
  defineCliFixture({
    id: 'commands.pass-through-program',
    family: 'commands',
    title: 'Pass-through command program',
    capabilities: ['argv.pass-through', 'options.local'],
    value: {
      name: 'proxy',
      commands: [
        {
          name: 'exec',
          allowPassThrough: true,
          options: [{ name: 'profile', type: 'string', flags: ['--profile'] }],
          positionals: [{ name: 'script' }]
        }
      ]
    }
  }),
  defineCliFixture({
    id: 'commands.deprecated-program',
    family: 'commands',
    title: 'Deprecated alias program',
    capabilities: ['command.aliases', 'diagnostics.deprecated-alias'],
    value: {
      name: 'deprecated',
      commands: [
        {
          name: 'remove',
          aliases: [{ name: 'rm', deprecated: 'Use remove instead.' }],
          positionals: [{ name: 'target' }]
        }
      ]
    }
  }),
  defineCliFixture({
    id: 'commands.large-program',
    family: 'commands',
    title: 'Large command program',
    capabilities: ['command.paths', 'scale.command-index'],
    value: largeCommandFixtureValue({ commandCount: 128, programName: 'large' })
  })
]);

export const configFixtures: readonly CliFixture[] = Object.freeze([
  defineCliFixture({
    id: 'config.config-layer-stack',
    family: 'config',
    title: 'Config layer stack',
    capabilities: ['config.precedence', 'config.provenance'],
    value: {
      definition: {
        fields: [
          { name: 'mode', type: 'string', default: 'safe', env: 'SHIP_MODE' },
          { name: 'retries', type: 'number', default: 1, env: 'SHIP_RETRIES' }
        ]
      },
      input: {
        workspaceDefaults: { mode: 'workspace' },
        configFiles: [{ path: '.shiprc.json', version: '1', values: { mode: 'file' } }],
        env: { SHIP_MODE: 'env', SHIP_RETRIES: '3' },
        argv: { mode: 'argv' }
      }
    }
  }),
  defineCliFixture({
    id: 'config.config-discovery-scope',
    family: 'config',
    title: 'Config discovery scope',
    capabilities: ['config.discovery'],
    value: {
      discovery: {
        scope: 'explicit_paths',
        cwd: '/workspace',
        explicitPaths: ['a.json', 'b.json']
      }
    }
  }),
  defineCliFixture({
    id: 'config.config-migration-v1-v2',
    family: 'config',
    title: 'Config migration v1 to v2',
    capabilities: ['config.versioning', 'config.migration'],
    value: {
      migration: { from: '1', to: '2', rename: { zone: 'region' } },
      input: { path: 'ship.v1.json', version: '1', values: { zone: 'eu' } }
    }
  }),
  defineCliFixture({
    id: 'config.config-malformed',
    family: 'config',
    title: 'Malformed config input',
    capabilities: ['config.diagnostics'],
    value: {
      path: 'bad.json',
      text: '{'
    }
  })
]);

export const pluginFixtures: readonly CliFixture[] = Object.freeze([
  defineCliFixture({
    id: 'plugins.compatible-plugin',
    family: 'plugins',
    title: 'Compatible plugin manifest',
    capabilities: ['plugins.manifest', 'plugins.compatibility'],
    value: {
      manifest: {
        name: 'ship-audit',
        version: '1.0.0',
        cliCore: { minVersion: '0.1.0' },
        runtimes: ['node', 'deno', 'bun'],
        capabilities: ['audit'],
        hooks: [{ name: 'audit-prerun', event: 'prerun', order: 10 }]
      }
    }
  }),
  defineCliFixture({
    id: 'plugins.version-mismatch-plugin',
    family: 'plugins',
    title: 'Version mismatch plugin manifest',
    capabilities: ['plugins.compatibility', 'plugins.diagnostics'],
    value: {
      manifest: {
        name: 'future-plugin',
        version: '1.0.0',
        cliCore: { minVersion: '99.0.0' }
      }
    }
  }),
  defineCliFixture({
    id: 'plugins.runtime-mismatch-plugin',
    family: 'plugins',
    title: 'Runtime mismatch plugin manifest',
    capabilities: ['plugins.compatibility', 'plugins.runtime'],
    value: {
      manifest: {
        name: 'node-only-plugin',
        version: '1.0.0',
        runtimes: ['node']
      },
      runtime: 'deno'
    }
  }),
  defineCliFixture({
    id: 'plugins.hook-order-plugin-set',
    family: 'plugins',
    title: 'Hook ordering plugin set',
    capabilities: ['plugins.hooks', 'plugins.hook-order'],
    value: {
      manifests: [
        { name: 'first-plugin', version: '1.0.0', hooks: [{ name: 'prepare', event: 'prerun', before: ['second-plugin:observe'] }] },
        { name: 'second-plugin', version: '1.0.0', hooks: [{ name: 'observe', event: 'prerun' }] }
      ]
    }
  }),
  defineCliFixture({
    id: 'plugins.faulty-plugin-manifest',
    family: 'plugins',
    title: 'Faulty plugin manifest',
    capabilities: ['plugins.manifest', 'plugins.diagnostics'],
    value: {
      manifest: {
        name: '',
        version: '',
        hooks: [{ name: '', event: 'init' }]
      }
    }
  }),
  defineCliFixture({
    id: 'plugins.faulty-plugin-runtime',
    family: 'plugins',
    title: 'Faulty plugin runtime',
    capabilities: ['plugins.lazy-loading', 'plugins.fault-isolation'],
    value: {
      manifest: {
        name: 'faulty-runtime',
        version: '1.0.0',
        hooks: [{ name: 'explode', event: 'prerun' }]
      },
      failure: 'loader throws'
    }
  })
]);

export const runFixtures: readonly CliFixture[] = Object.freeze([
  defineCliFixture({
    id: 'runs.apply-run',
    family: 'runs',
    title: 'Apply run',
    capabilities: ['run.apply', 'run.events', 'run.effects'],
    value: {
      argv: ['deploy', 'api'],
      mode: 'apply',
      expectedExitKind: 'ok'
    }
  }),
  defineCliFixture({
    id: 'runs.plan-run',
    family: 'runs',
    title: 'Plan run',
    capabilities: ['run.plan', 'run.effects'],
    value: {
      argv: ['deploy', 'api'],
      mode: 'plan',
      effects: [{ kind: 'spawn', command: 'ship', argv: ['deploy', 'api'] }]
    }
  }),
  defineCliFixture({
    id: 'runs.long-running-run',
    family: 'runs',
    title: 'Long-running run',
    capabilities: ['run.identifiers', 'run.events'],
    value: {
      runId: 'run-long',
      mode: 'apply',
      elapsedMs: 5000
    }
  }),
  defineCliFixture({
    id: 'runs.cancelled-run',
    family: 'runs',
    title: 'Cancelled run',
    capabilities: ['run.cancelled', 'run.exit-status'],
    value: {
      cancelled: true,
      expectedExitKind: 'cancelled'
    }
  }),
  defineCliFixture({
    id: 'runs.timeout-run',
    family: 'runs',
    title: 'Timeout run',
    capabilities: ['run.timeout', 'run.exit-status'],
    value: {
      timeoutMs: 100,
      elapsedMs: 101,
      expectedExitKind: 'timeout'
    }
  }),
  defineCliFixture({
    id: 'runs.interrupted-run',
    family: 'runs',
    title: 'Interrupted run',
    capabilities: ['run.interrupted', 'run.exit-status'],
    value: {
      interrupted: true,
      expectedExitKind: 'interrupted'
    }
  })
]);

export const cliCoreFixtures: readonly CliFixture[] = Object.freeze([
  ...commandFixtures,
  ...configFixtures,
  ...pluginFixtures,
  ...runFixtures
]);
// Stryker restore all

export function defineCliFixture(definition: CliFixtureDefinition): CliFixture {
  const fixture = buildFixture(definition);
  return freezeFixture(fixture);
}

export function createLargeCommandDefinition(input: LargeCommandFixtureInput = {}): CliDefinition {
  const commandCount = normalizeCommandCount(input.commandCount ?? 128);
  const programName = input.programName ?? 'large';
  return largeCommandDefinition({ commandCount, programName });
}

export function createLargeCommandFixture(input: LargeCommandFixtureInput = {}): CliFixture {
  const commandCount = normalizeCommandCount(input.commandCount ?? 128);
  const programName = input.programName ?? 'large';
  return defineCliFixture({
    id: input.id ?? `commands.large-program.${commandCount}`,
    family: 'commands',
    title: `Large command program (${commandCount})`,
    description: 'Generated command-surface fixture for scale-sensitive compilation, lookup, completion, repair, and manifest checks.',
    capabilities: ['command.paths', 'command.aliases', 'options.local', 'scale.command-index', 'scale.generated'],
    value: largeCommandFixtureValue({ commandCount, programName })
  });
}

export function createCliFixtureRegistry(
  fixtures: readonly CliFixtureDefinition[] = cliCoreFixtures
): CliFixtureRegistry {
  const byId = new Map<string, CliFixture>();

  for (const fixtureDefinition of fixtures) {
    const fixture = defineCliFixture(fixtureDefinition);
    if (byId.has(fixture.id)) {
      throw new CliFixtureRegistryError(
        diagnostic('CLI_TEST_DUPLICATE_FIXTURE', 'Fixture id is already registered.', {
          fixtureId: fixture.id
        })
      );
    }
    byId.set(fixture.id, fixture);
  }

  const snapshot = Object.freeze([...byId.values()].sort(compareFixtureId));

  return Object.freeze({
    get(id: string): CliFixture | undefined {
      return byId.get(id);
    },
    has(id: string): boolean {
      return byId.has(id);
    },
    list(family?: CliFixtureFamily): readonly CliFixture[] {
      const selected = family === undefined ? snapshot : snapshot.filter((fixture) => fixture.family === family);
      return Object.freeze([...selected]);
    },
    snapshot(): readonly CliFixture[] {
      return Object.freeze([...snapshot]);
    }
  });
}

export function createCliHarness(input: CliHarnessInput = {}): CliHarness {
  const entrypoints = new Map<CliPackageEntrypoint, CliEntrypointModule>();

  if (input.entrypoints !== undefined) {
    for (const [entrypoint, module] of Object.entries(input.entrypoints) as Array<
      [string, CliEntrypointModule | undefined]
    >) {
      if (module !== undefined && isPackageEntrypoint(entrypoint)) {
        entrypoints.set(entrypoint, Object.freeze({ ...module }));
      }
    }
  }

  const fixtures = createCliFixtureRegistry(input.fixtures ?? cliCoreFixtures);

  return Object.freeze({
    program: input.program,
    fixtures,
    getEntrypoint(entrypoint: CliPackageEntrypoint): CliEntrypointModule | undefined {
      return entrypoints.get(entrypoint);
    }
  });
}

export async function runCliScenario(harness: CliHarness, scenario: CliScenario): Promise<CliScenarioResult> {
  const steps: CliScenarioStepResult[] = [];
  for (const [index, step] of scenario.steps.entries()) {
    steps.push(await runScenarioStep(harness, step, index));
  }
  const diagnostics = Object.freeze(steps.flatMap((step) => step.diagnostics));
  const status: CliScenarioStatus = diagnostics.length === 0 ? 'passed' : 'failed';

  return Object.freeze({
    scenarioId: scenario.id,
    status,
    steps: Object.freeze(steps),
    diagnostics
  });
}

class CliFixtureRegistryError extends Error {
  public readonly diagnostic: CliTestDiagnostic;

  public constructor(diagnosticValue: CliTestDiagnostic) {
    super(diagnosticValue.message);
    this.name = 'CliFixtureRegistryError';
    this.diagnostic = diagnosticValue;
  }
}

const packageEntrypoints: readonly CliPackageEntrypoint[] = Object.freeze([
  'root',
  'adapter',
  'help',
  'completion',
  'manifest',
  'config',
  'effects',
  'plugins',
  'repair',
  'schema',
  'testing'
]);

function buildFixture(definition: CliFixtureDefinition): CliFixture {
  const fixtureValue = definition.value ?? null;
  const capabilities = Object.freeze([...definition.capabilities]);

  if (definition.description === undefined) {
    return {
      id: definition.id,
      family: definition.family,
      title: definition.title,
      capabilities,
      value: fixtureValue
    };
  }

  return {
    id: definition.id,
    family: definition.family,
    title: definition.title,
    description: definition.description,
    capabilities,
    value: fixtureValue
  };
}

function largeCommandDefinition(input: { readonly commandCount: number; readonly programName: string }): CliDefinition {
  return {
    name: input.programName,
    commands: Array.from({ length: input.commandCount }, (_unused, index) => ({
      name: largeCommandName(index),
      aliases: [`c${index}`],
      options: [{ name: `detail${index}`, type: 'boolean', flags: [`--detail-${index}`] }],
      positionals: [{ name: 'target', required: false }]
    }))
  };
}

function largeCommandFixtureValue(input: { readonly commandCount: number; readonly programName: string }): CliFixtureValue {
  return largeCommandDefinition(input) as unknown as CliFixtureValue;
}

function largeCommandName(index: number): string {
  return `command-${index}`;
}

function normalizeCommandCount(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.trunc(value);
}

async function runScenarioStep(harness: CliHarness, step: CliScenarioStep, index: number): Promise<CliScenarioStepResult> {
  const diagnostics = await inspectScenarioStep(harness, step);

  return Object.freeze({
    index,
    name: step.name,
    kind: step.kind,
    status: diagnostics.length === 0 ? 'passed' : 'failed',
    diagnostics: Object.freeze(diagnostics)
  });
}

function inspectScenarioStep(
  harness: CliHarness,
  step: CliScenarioStep
): readonly CliTestDiagnostic[] | Promise<readonly CliTestDiagnostic[]> {
  if (step.kind === 'entrypoint-load') return inspectEntrypointStep(harness, step);
  if (step.kind === 'fixture-available') return inspectFixtureStep(harness, step);
  if (step.kind === 'parse') return inspectParseStep(step);
  if (step.kind === 'config-resolution') return inspectConfigStep(step);
  if (step.kind === 'plugin-command-application') return inspectPluginCommandStep(step);
  return inspectRunStep(step);
}

function inspectEntrypointStep(harness: CliHarness, step: CliEntrypointLoadStep): readonly CliTestDiagnostic[] {
  const entrypoint = harness.getEntrypoint(step.entrypoint);
  if (entrypoint === undefined) {
    return [
      diagnostic('CLI_TEST_ENTRYPOINT_MISSING', 'Entrypoint module was not supplied to the harness.', {
        entrypoint: step.entrypoint
      })
    ];
  }

  const expectedExports = step.expectedExports ?? [];
  return expectedExports
    .filter((exportName) => !(exportName in entrypoint))
    .map((exportName) =>
      diagnostic('CLI_TEST_EXPORT_MISSING', 'Entrypoint module does not expose an expected export.', {
        entrypoint: step.entrypoint,
        exportName
      })
    );
}

function inspectFixtureStep(harness: CliHarness, step: CliFixtureAvailableStep): readonly CliTestDiagnostic[] {
  const fixture = harness.fixtures.get(step.fixtureId);
  if (fixture === undefined) {
    return [
      diagnostic('CLI_TEST_FIXTURE_MISSING', 'Fixture is not registered in the harness.', {
        fixtureId: step.fixtureId
      })
    ];
  }

  if (step.expectedFamily !== undefined && fixture.family !== step.expectedFamily) {
    return [
      diagnostic('CLI_TEST_FIXTURE_FAMILY_MISMATCH', 'Fixture family does not match the scenario expectation.', {
        fixtureId: fixture.id,
        expectedFamily: step.expectedFamily,
        actualFamily: fixture.family
      })
    ];
  }

  return [];
}

function inspectParseStep(step: CliParseScenarioStep): readonly CliTestDiagnostic[] {
  const program = defineCli(step.definition);
  const invocation = parseCli(program, { argv: step.argv ?? [] });
  return Object.freeze([
    ...expectBoolean(step.name, 'parse ok', step.expectedOk, invocation.ok),
    ...expectStringArray(step.name, 'command path', step.expectedCommandPath, invocation.commandPath),
    ...expectDiagnosticCodes(step.name, step.expectedDiagnosticCodes, invocation.diagnostics.map((item) => item.code))
  ]);
}

function inspectConfigStep(step: CliConfigScenarioStep): readonly CliTestDiagnostic[] {
  const program = defineCli(step.definition);
  const resolution = resolveCliConfig(program, step.input ?? {});
  return Object.freeze([
    ...expectBoolean(step.name, 'config ok', step.expectedOk, resolution.ok),
    ...expectRecord(step.name, 'config values', step.expectedValues, resolution.values),
    ...expectDiagnosticCodes(step.name, step.expectedDiagnosticCodes, resolution.diagnostics.map((item) => item.code))
  ]);
}

function inspectPluginCommandStep(step: CliPluginCommandScenarioStep): readonly CliTestDiagnostic[] {
  const application = applyCliPluginCommands(step.definition, step.plugins);
  return Object.freeze([
    ...expectBoolean(step.name, 'plugin command application ok', step.expectedOk, application.ok),
    ...expectPaths(step.name, 'plugin command paths', step.expectedCommandPaths, application.program.commands.map((command) => command.path)),
    ...expectDiagnosticCodes(step.name, step.expectedDiagnosticCodes, application.diagnostics.map((item) => item.code))
  ]);
}

async function inspectRunStep(step: CliRunScenarioStep): Promise<readonly CliTestDiagnostic[]> {
  const program = defineCli(step.definition);
  const result = await runCli(program, {
    mode: step.mode ?? 'plan',
    argv: step.argv ?? [],
    ...(step.effects === undefined ? {} : { effects: step.effects }),
    ...(step.artifacts === undefined ? {} : { artifacts: step.artifacts }),
    ...(step.context === undefined ? {} : { context: step.context }),
    ...(step.cancelled === undefined ? {} : { cancelled: step.cancelled }),
    ...(step.interrupted === undefined ? {} : { interrupted: step.interrupted }),
    ...(step.timeoutMs === undefined ? {} : { timeoutMs: step.timeoutMs }),
    ...(step.elapsedMs === undefined ? {} : { elapsedMs: step.elapsedMs })
  });
  return Object.freeze([
    ...expectBoolean(step.name, 'run ok', step.expectedOk, result.ok),
    ...expectString(step.name, 'exit kind', step.expectedExitKind, result.exitKind),
    ...expectStringArray(step.name, 'event names', step.expectedEventNames, result.events.map((event) => event.name)),
    ...expectDiagnosticCodes(step.name, step.expectedDiagnosticCodes, result.diagnostics.map((item) => item.code))
  ]);
}

function expectBoolean(
  stepName: string,
  expectation: string,
  expected: boolean | undefined,
  actual: boolean
): readonly CliTestDiagnostic[] {
  if (expected === undefined || expected === actual) return [];
  return [expectationDiagnostic(stepName, expectation, expected, actual)];
}

function expectString(
  stepName: string,
  expectation: string,
  expected: string | undefined,
  actual: string
): readonly CliTestDiagnostic[] {
  if (expected === undefined || expected === actual) return [];
  return [expectationDiagnostic(stepName, expectation, expected, actual)];
}

function expectStringArray(
  stepName: string,
  expectation: string,
  expected: readonly string[] | undefined,
  actual: readonly string[]
): readonly CliTestDiagnostic[] {
  if (expected === undefined || sameJson(expected, actual)) return [];
  return [expectationDiagnostic(stepName, expectation, [...expected], [...actual])];
}

function expectPaths(
  stepName: string,
  expectation: string,
  expected: readonly (readonly string[])[] | undefined,
  actual: readonly (readonly string[])[]
): readonly CliTestDiagnostic[] {
  if (expected === undefined) return [];
  const actualKeys = new Set(actual.map((path) => path.join('\u0000')));
  const missing = expected.filter((path) => !actualKeys.has(path.join('\u0000')));
  if (missing.length === 0) return [];
  return [expectationDiagnostic(stepName, expectation, expected.map((path) => [...path]), actual.map((path) => [...path]))];
}

function expectRecord(
  stepName: string,
  expectation: string,
  expected: Readonly<Record<string, ConfigValue>> | undefined,
  actual: Readonly<Record<string, ConfigValue>>
): readonly CliTestDiagnostic[] {
  if (expected === undefined || sameJson(expected, actual)) return [];
  return [expectationDiagnostic(stepName, expectation, expected as CliFixtureValue, actual as CliFixtureValue)];
}

function expectDiagnosticCodes(
  stepName: string,
  expected: readonly CliDiagnosticCode[] | undefined,
  actual: readonly CliDiagnosticCode[]
): readonly CliTestDiagnostic[] {
  if (expected === undefined || sameJson(expected, actual)) return [];
  return [expectationDiagnostic(stepName, 'diagnostic codes', [...expected], [...actual])];
}

function expectationDiagnostic(
  stepName: string,
  expectation: string,
  expected: CliFixtureValue,
  actual: CliFixtureValue
): CliTestDiagnostic {
  return diagnostic('CLI_TEST_EXPECTATION_FAILED', 'Scenario step expectation failed.', {
    stepName,
    expectation,
    expected,
    actual
  });
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function diagnostic(
  code: CliTestDiagnosticCode,
  message: string,
  fields: Readonly<Record<string, CliFixtureValue>>
): CliTestDiagnostic {
  return Object.freeze({
    code,
    message,
    fields: freezeFixtureRecord(fields)
  });
}

function freezeFixture(fixture: CliFixture): CliFixture {
  return Object.freeze({
    ...fixture,
    capabilities: Object.freeze([...fixture.capabilities]),
    value: freezeFixtureValue(fixture.value)
  });
}

function freezeFixtureRecord(record: Readonly<Record<string, CliFixtureValue>>): Readonly<Record<string, CliFixtureValue>> {
  const entries = Object.entries(record).map(([key, value]) => [key, freezeFixtureValue(value)] as const);
  return Object.freeze(Object.fromEntries(entries) as Record<string, CliFixtureValue>);
}

function freezeFixtureValue(value: CliFixtureValue): CliFixtureValue {
  if (Array.isArray(value)) {
    const items = value as readonly CliFixtureValue[];
    return Object.freeze(items.map((item) => freezeFixtureValue(item)));
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Readonly<Record<string, CliFixtureValue>>;
    return freezeFixtureRecord(record);
  }
  return value;
}

function compareFixtureId(left: CliFixture, right: CliFixture): number {
  return left.id.localeCompare(right.id);
}

function isPackageEntrypoint(entrypoint: string): entrypoint is CliPackageEntrypoint {
  return packageEntrypoints.includes(entrypoint as CliPackageEntrypoint);
}
