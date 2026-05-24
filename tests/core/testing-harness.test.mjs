import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
  assert.deepEqual(registry.list('runs').map((fixture) => fixture.id), ['runs.plan-run']);
  assert.equal(registry.has('config.layer-stack'), true);
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
    (error) => error.diagnostic?.code === 'CLI_TEST_DUPLICATE_FIXTURE'
  );
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
        kind: 'fixture-available',
        name: 'unknown fixture is reported',
        fixtureId: 'commands.unknown',
        expectedFamily: 'commands'
      }
    ]
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    'CLI_TEST_EXPORT_MISSING',
    'CLI_TEST_FIXTURE_MISSING'
  ]);
});
