import * as testing from '@ismail-elkorchi/cli-core/testing';

export async function runTestingHarnessExample() {
  const harness = testing.createCliHarness({
    entrypoints: {
      testing
    }
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
        name: 'foundation fixture exists',
        fixtureId: 'foundation.package-metadata',
        expectedFamily: 'foundation'
      }
    ]
  });
}
