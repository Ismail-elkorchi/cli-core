import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cliCoreFixtures,
  createLargeCommandDefinition,
  createLargeCommandFixture,
  createCliFixtureRegistry,
  createCliHarness,
  defineCliFixture,
  runCliScenario
} from '../../dist/testing/index.js';

test('fixture definitions are cloned and immutable', () => {
  const source = {
    id: 'commands.minimal-program',
    family: 'commands',
    title: 'Minimal program',
    capabilities: ['command.definition'],
    value: {
      command: 'minimal'
    }
  };

  const fixture = defineCliFixture(source);
  source.capabilities.push('mutated');
  source.value.command = 'changed';

  assert.deepEqual(fixture.capabilities, ['command.definition']);
  assert.deepEqual(fixture.value, { command: 'minimal' });
  assert.throws(() => {
    fixture.value.command = 'changed';
  }, TypeError);
});

test('fixture definitions preserve optional descriptions and nested arrays immutably', () => {
  const source = {
    id: 'commands.described',
    family: 'commands',
    title: 'Described fixture',
    description: 'Used by a scenario.',
    capabilities: ['command.definition'],
    value: {
      commands: [{ name: 'deploy', aliases: ['d'] }],
      metadata: { owner: 'team-a' }
    }
  };
  const fixture = defineCliFixture(source);
  source.value.commands[0].aliases.push('mutated');
  source.value.metadata.owner = 'team-b';

  assert.equal(fixture.description, 'Used by a scenario.');
  assert.deepEqual(fixture.value.commands[0].aliases, ['d']);
  assert.deepEqual(fixture.value.metadata, { owner: 'team-a' });
  assert.throws(() => {
    fixture.value.commands[0].aliases.push('x');
  }, TypeError);
});

test('fixture registry provides deterministic snapshots', () => {
  const registry = createCliFixtureRegistry([
    {
      id: 'runs.plan-run',
      family: 'runs',
      title: 'Plan run',
      capabilities: ['run.plan']
    },
    {
      id: 'config.layer-stack',
      family: 'config',
      title: 'Config layer stack',
      capabilities: ['config.precedence']
    }
  ]);

  assert.deepEqual(registry.snapshot().map((fixture) => fixture.id), ['config.layer-stack', 'runs.plan-run']);
  assert.deepEqual(registry.list().map((fixture) => fixture.id), ['config.layer-stack', 'runs.plan-run']);
  assert.deepEqual(registry.list('runs').map((fixture) => fixture.id), ['runs.plan-run']);
  assert.deepEqual(registry.list('plugins'), []);
  assert.equal(registry.get('runs.plan-run').family, 'runs');
  assert.equal(registry.get('missing'), undefined);
  assert.equal(registry.has('config.layer-stack'), true);
  assert.equal(registry.has('missing'), false);

  const snapshot = registry.snapshot();
  assert.throws(() => {
    snapshot.pop();
  }, TypeError);
  assert.deepEqual(registry.snapshot().map((fixture) => fixture.id), ['config.layer-stack', 'runs.plan-run']);
});

test('fixtures without descriptions omit the optional description field', () => {
  const fixture = defineCliFixture({
    id: 'runs.no-description',
    family: 'runs',
    title: 'No description fixture',
    capabilities: ['run.plan']
  });

  assert.equal(Object.hasOwn(fixture, 'description'), false);
  assert.equal(fixture.value, null);
});

test('duplicate fixture ids fail with a stable diagnostic', () => {
  assert.throws(
    () => {
      createCliFixtureRegistry([
        {
          id: 'commands.minimal-program',
          family: 'commands',
          title: 'Minimal program',
          capabilities: ['command.definition']
        },
        {
          id: 'commands.minimal-program',
          family: 'commands',
          title: 'Duplicate minimal program',
          capabilities: ['command.definition']
        }
      ]);
    },
    (error) => {
      assert.equal(error.name, 'CliFixtureRegistryError');
      assert.equal(error.diagnostic?.code, 'CLI_TEST_DUPLICATE_FIXTURE');
      assert.equal(error.diagnostic?.fields.fixtureId, 'commands.minimal-program');
      return true;
    }
  );
});

test('default harness exposes built-in fixtures without requiring caller inventory checks', () => {
  const harness = createCliHarness();

  assert.equal(harness.program, undefined);
  assert.equal(harness.fixtures.has('commands.minimal-program'), true);
  assert.equal(harness.fixtures.has('runs.plan-run'), true);
  assert.equal(cliCoreFixtures.some((fixture) => fixture.id === 'plugins.compatible-plugin'), true);
});

test('createCliHarness freezes supplied entrypoint modules and ignores unsupported entries', () => {
  const module = { createCliHarness, mutable: true };
  const harness = createCliHarness({
    program: { name: 'ship' },
    entrypoints: {
      testing: module,
      root: undefined,
      notAnEntrypoint: { leaked: true }
    }
  });
  module.extra = true;
  const testing = harness.getEntrypoint('testing');

  assert.deepEqual(harness.program, { name: 'ship' });
  assert.equal(testing.createCliHarness, createCliHarness);
  assert.equal(testing.extra, undefined);
  assert.throws(() => {
    testing.mutable = false;
  }, TypeError);
  assert.equal(harness.getEntrypoint('root'), undefined);
  assert.equal(harness.getEntrypoint('schema'), undefined);
});

test('createCliHarness accepts every public package entrypoint name', () => {
  const module = { ok: true };
  const harness = createCliHarness({
    entrypoints: {
      root: module,
      adapter: module,
      help: module,
      completion: module,
      manifest: module,
      config: module,
      effects: module,
      plugins: module,
      repair: module,
      schema: module,
      testing: module
    }
  });

  for (const entrypoint of ['root', 'adapter', 'help', 'completion', 'manifest', 'config', 'effects', 'plugins', 'repair', 'schema', 'testing']) {
    assert.equal(harness.getEntrypoint(entrypoint).ok, true);
  }
});

test('scenario runner reports fixture and entrypoint diagnostics as data', async () => {
  const harness = createCliHarness({
    entrypoints: {
      testing: await import('../../dist/testing/index.js')
    }
  });

  const result = await runCliScenario(harness, {
    id: 'unit.testing-harness.diagnostics',
    steps: [
      {
        kind: 'entrypoint-load',
        name: 'testing entrypoint exposes harness',
        entrypoint: 'testing',
        expectedExports: ['createCliHarness', 'missingExport']
      },
      {
        kind: 'entrypoint-load',
        name: 'missing root entrypoint is reported',
        entrypoint: 'root'
      },
      {
        kind: 'fixture-available',
        name: 'unknown fixture is reported',
        fixtureId: 'commands.unknown',
        expectedFamily: 'commands'
      },
      {
        kind: 'fixture-available',
        name: 'family mismatch is reported',
        fixtureId: 'commands.minimal-program',
        expectedFamily: 'runs'
      },
      {
        kind: 'fixture-available',
        name: 'fixture without expected family still passes',
        fixtureId: 'runs.plan-run'
      },
      {
        kind: 'entrypoint-load',
        name: 'entrypoint without expected exports still passes',
        entrypoint: 'testing'
      }
    ]
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.steps.map((step) => step.status), ['failed', 'failed', 'failed', 'failed', 'passed', 'passed']);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    'CLI_TEST_EXPORT_MISSING',
    'CLI_TEST_ENTRYPOINT_MISSING',
    'CLI_TEST_FIXTURE_MISSING',
    'CLI_TEST_FIXTURE_FAMILY_MISMATCH'
  ]);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.fields), [
    { entrypoint: 'testing', exportName: 'missingExport' },
    { entrypoint: 'root' },
    { fixtureId: 'commands.unknown' },
    {
      fixtureId: 'commands.minimal-program',
      expectedFamily: 'runs',
      actualFamily: 'commands'
    }
  ]);
});

test('scenario runner passes when entrypoint exports and fixture family match', async () => {
  const harness = createCliHarness({
    entrypoints: {
      testing: await import('../../dist/testing/index.js')
    }
  });
  const result = await runCliScenario(harness, {
    id: 'unit.testing-harness.passing',
    steps: [
      {
        kind: 'entrypoint-load',
        name: 'testing entrypoint exposes harness',
        entrypoint: 'testing',
        expectedExports: ['createCliHarness', 'runCliScenario']
      },
      {
        kind: 'fixture-available',
        name: 'built-in command fixture is available',
        fixtureId: 'commands.minimal-program',
        expectedFamily: 'commands'
      }
    ]
  });

  assert.equal(result.scenarioId, 'unit.testing-harness.passing');
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.steps.map((step) => step.status), ['passed', 'passed']);
  assert.deepEqual(result.diagnostics, []);
});

test('large command fixture helpers normalize counts and generate indexed command shapes', () => {
  const defaultDefinition = createLargeCommandDefinition();
  const fractional = createLargeCommandDefinition({ commandCount: 2.8, programName: 'fleet' });
  const invalid = createLargeCommandDefinition({ commandCount: Number.NaN, programName: 'bad' });
  const zero = createLargeCommandDefinition({ commandCount: 0, programName: 'zero' });
  const defaultFixture = createLargeCommandFixture();
  const fixture = createLargeCommandFixture({ id: 'commands.large.custom', commandCount: 3, programName: 'fleet' });

  assert.equal(defaultDefinition.name, 'large');
  assert.equal(defaultDefinition.commands.length, 128);
  assert.equal(fractional.name, 'fleet');
  assert.equal(fractional.commands.length, 2);
  assert.deepEqual(fractional.commands[1], {
    name: 'command-1',
    aliases: ['c1'],
    options: [{ name: 'detail1', type: 'boolean', flags: ['--detail-1'] }],
    positionals: [{ name: 'target', required: false }]
  });
  assert.equal(invalid.commands.length, 1);
  assert.equal(zero.commands.length, 1);
  assert.equal(defaultFixture.id, 'commands.large-program.128');
  assert.equal(defaultFixture.title, 'Large command program (128)');
  assert.equal(defaultFixture.description.length > 0, true);
  assert.equal(defaultFixture.value.name, 'large');
  assert.deepEqual(defaultFixture.capabilities, [
    'command.paths',
    'command.aliases',
    'options.local',
    'scale.command-index',
    'scale.generated'
  ]);
  assert.equal(fixture.id, 'commands.large.custom');
  assert.equal(fixture.family, 'commands');
  assert.equal(fixture.value.name, 'fleet');
  assert.equal(fixture.value.commands.length, 3);
});
