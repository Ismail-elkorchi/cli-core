import * as testing from '@ismail-elkorchi/cli-core/testing';

export async function runTestingHarnessExample() {
  const harness = testing.createCliHarness({
    entrypoints: {
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

  return testing.runCliScenario(harness, {
    id: 'example.testing-harness',
    steps: [
      {
        kind: 'entrypoint-load',
        name: 'testing entrypoint exposes the scenario runner',
        entrypoint: 'testing',
        expectedExports: ['createCliHarness', 'runCliScenario']
      },
      {
        kind: 'fixture-available',
        name: 'caller-provided fixture exists',
        fixtureId: 'example.local-fixture',
        expectedFamily: 'examples'
      }
    ]
  });
}
