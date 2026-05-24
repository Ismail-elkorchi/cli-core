import assert from 'node:assert/strict';
import test from 'node:test';
import * as root from '../../dist/index.js';
import * as testing from '../../dist/testing/index.js';

test('consumer can run a public harness scenario against package entrypoints and fixtures', async () => {
  const harness = testing.createCliHarness({
    entrypoints: {
      root,
      testing
    },
    fixtures: [
      {
        id: 'example.local-fixture',
        family: 'examples',
        title: 'Local fixture',
        capabilities: ['example']
      }
    ]
  });

  const result = await testing.runCliScenario(harness, {
    id: 'acceptance.foundation-harness',
    title: 'Foundation harness smoke',
    steps: [
      {
        kind: 'entrypoint-load',
        name: 'root exposes package metadata',
        entrypoint: 'root',
        expectedExports: ['cliCorePackage']
      },
      {
        kind: 'entrypoint-load',
        name: 'testing exposes harness functions',
        entrypoint: 'testing',
        expectedExports: ['createCliHarness', 'runCliScenario', 'createCliFixtureRegistry']
      },
      {
        kind: 'fixture-available',
        name: 'caller-provided fixture is available',
        fixtureId: 'example.local-fixture',
        expectedFamily: 'examples'
      }
    ]
  });

  assert.equal(result.status, 'passed');
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.steps.map((step) => step.status), ['passed', 'passed', 'passed']);
});
