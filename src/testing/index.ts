import { cliCorePackage } from '../package.js';

export { cliCorePackage };
export type { CliCorePackage } from '../package.js';

export type CliFixtureValue =
  | null
  | boolean
  | number
  | string
  | readonly CliFixtureValue[]
  | { readonly [key: string]: CliFixtureValue };

export type CliFixtureFamily = 'foundation' | 'commands' | 'config' | 'plugins' | 'runs';

export interface CliFixtureDefinition {
  readonly id: string;
  readonly family: CliFixtureFamily;
  readonly title: string;
  readonly description?: string;
  readonly capabilities: readonly string[];
  readonly data?: CliFixtureValue;
}

export interface CliFixture {
  readonly id: string;
  readonly family: CliFixtureFamily;
  readonly title: string;
  readonly description?: string;
  readonly capabilities: readonly string[];
  readonly data: CliFixtureValue;
}

export interface CliFixtureRegistry {
  readonly get: (id: string) => CliFixture | undefined;
  readonly has: (id: string) => boolean;
  readonly list: (family?: CliFixtureFamily) => readonly CliFixture[];
  readonly snapshot: () => readonly CliFixture[];
}

export type CliPackageEntrypoint =
  | 'root'
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

export type CliScenarioStep = CliEntrypointLoadStep | CliFixtureAvailableStep;

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

export type CliScenarioStatus = 'passed' | 'failed';

export type CliTestDiagnosticCode =
  | 'CLI_TEST_DUPLICATE_FIXTURE'
  | 'CLI_TEST_ENTRYPOINT_MISSING'
  | 'CLI_TEST_EXPORT_MISSING'
  | 'CLI_TEST_FIXTURE_MISSING'
  | 'CLI_TEST_FIXTURE_FAMILY_MISMATCH';

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

export const foundationFixtures = Object.freeze([
  defineCliFixture({
    id: 'foundation.package-metadata',
    family: 'foundation',
    title: 'Package metadata contract',
    description: 'The package name, semantic version, and contract version are importable data.',
    capabilities: ['package.metadata', 'package.contract-version'],
    data: {
      name: cliCorePackage.name,
      version: cliCorePackage.version,
      contractVersion: cliCorePackage.contractVersion
    }
  }),
  defineCliFixture({
    id: 'foundation.entrypoints',
    family: 'foundation',
    title: 'Public entrypoint contract',
    description: 'The root and documented subpath entrypoints can be imported by consumers.',
    capabilities: ['package.exports', 'subpath.imports'],
    data: {
      entrypoints: ['root', 'help', 'completion', 'manifest', 'config', 'effects', 'plugins', 'repair', 'schema', 'testing']
    }
  })
]);

export const commandFixtures = Object.freeze([
  defineCliFixture({
    id: 'commands.minimal-program',
    family: 'commands',
    title: 'Minimal command program',
    capabilities: ['command.definition', 'command.compilation'],
    data: {
      name: 'minimal',
      commands: [{ name: 'run' }]
    }
  }),
  defineCliFixture({
    id: 'commands.tree-program',
    family: 'commands',
    title: 'Nested command tree',
    capabilities: ['command.paths', 'command.aliases', 'options.global', 'options.local'],
    data: {
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
    data: {
      name: 'repair',
      commands: [{ name: 'install', aliases: ['i'] }, { name: 'inspect' }, { name: 'init' }]
    }
  }),
  defineCliFixture({
    id: 'commands.pass-through-program',
    family: 'commands',
    title: 'Pass-through command program',
    capabilities: ['argv.pass-through', 'options.local'],
    data: {
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
    data: {
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
    data: {
      name: 'large',
      commands: Array.from({ length: 128 }, (_unused, index) => ({
        name: `command-${index}`,
        aliases: [`c${index}`],
        options: [{ name: `option${index}`, type: 'boolean', flags: [`--option-${index}`] }]
      }))
    }
  })
]);

export const configFixtures = Object.freeze([
  defineCliFixture({
    id: 'config.config-layer-stack',
    family: 'config',
    title: 'Config layer stack',
    capabilities: ['config.precedence', 'config.provenance'],
    data: {
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
    data: {
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
    data: {
      migration: { from: '1', to: '2', rename: { zone: 'region' } },
      input: { path: 'ship.v1.json', version: '1', values: { zone: 'eu' } }
    }
  }),
  defineCliFixture({
    id: 'config.config-malformed',
    family: 'config',
    title: 'Malformed config input',
    capabilities: ['config.diagnostics'],
    data: {
      path: 'bad.json',
      text: '{'
    }
  })
]);

export const pluginFixtures = Object.freeze([
  defineCliFixture({
    id: 'plugins.compatible-plugin',
    family: 'plugins',
    title: 'Compatible plugin manifest',
    capabilities: ['plugins.manifest', 'plugins.compatibility'],
    data: {
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
    data: {
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
    data: {
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
    data: {
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
    data: {
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
    data: {
      manifest: {
        name: 'faulty-runtime',
        version: '1.0.0',
        hooks: [{ name: 'explode', event: 'prerun' }]
      },
      failure: 'loader throws'
    }
  })
]);

export const runFixtures = Object.freeze([
  defineCliFixture({
    id: 'runs.apply-run',
    family: 'runs',
    title: 'Apply run',
    capabilities: ['run.apply', 'run.events', 'run.effects'],
    data: {
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
    data: {
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
    data: {
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
    data: {
      cancelled: true,
      expectedExitKind: 'cancelled'
    }
  }),
  defineCliFixture({
    id: 'runs.timeout-run',
    family: 'runs',
    title: 'Timeout run',
    capabilities: ['run.timeout', 'run.exit-status'],
    data: {
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
    data: {
      interrupted: true,
      expectedExitKind: 'interrupted'
    }
  })
]);

export const cliCoreFixtures = Object.freeze([
  ...foundationFixtures,
  ...commandFixtures,
  ...configFixtures,
  ...pluginFixtures,
  ...runFixtures
]);

export function defineCliFixture(definition: CliFixtureDefinition): CliFixture {
  const fixture = buildFixture(definition);
  return freezeFixture(fixture);
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
  const steps = scenario.steps.map((step, index) => runScenarioStep(harness, step, index));
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
  'help',
  'completion',
  'manifest',
  'config',
  'plugins',
  'repair',
  'schema',
  'testing'
]);

function buildFixture(definition: CliFixtureDefinition): CliFixture {
  const fixtureData = cloneFixtureValue(definition.data ?? null);
  const capabilities = Object.freeze([...definition.capabilities]);

  if (definition.description === undefined) {
    return {
      id: definition.id,
      family: definition.family,
      title: definition.title,
      capabilities,
      data: fixtureData
    };
  }

  return {
    id: definition.id,
    family: definition.family,
    title: definition.title,
    description: definition.description,
    capabilities,
    data: fixtureData
  };
}

function runScenarioStep(harness: CliHarness, step: CliScenarioStep, index: number): CliScenarioStepResult {
  const diagnostics = step.kind === 'entrypoint-load'
    ? inspectEntrypointStep(harness, step)
    : inspectFixtureStep(harness, step);

  return Object.freeze({
    index,
    name: step.name,
    kind: step.kind,
    status: diagnostics.length === 0 ? 'passed' : 'failed',
    diagnostics: Object.freeze(diagnostics)
  });
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
    data: freezeFixtureValue(fixture.data)
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

function cloneFixtureValue(value: CliFixtureValue): CliFixtureValue {
  if (Array.isArray(value)) {
    return value.map((item) => cloneFixtureValue(item));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, cloneFixtureValue(entryValue)])
    ) as Record<string, CliFixtureValue>;
  }
  return value;
}

function compareFixtureId(left: CliFixture, right: CliFixture): number {
  return left.id.localeCompare(right.id);
}

function isPackageEntrypoint(entrypoint: string): entrypoint is CliPackageEntrypoint {
  return packageEntrypoints.includes(entrypoint as CliPackageEntrypoint);
}
