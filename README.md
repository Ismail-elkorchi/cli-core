# cli-core

Typed command-core primitives for TypeScript and JavaScript CLIs.

## Current Status

This package is at the package-foundation stage. The current public surface is
limited to stable package entrypoints, contract metadata, and a testing harness
for data-only fixture and entrypoint scenarios. Command, config, completion,
plugin, and run behavior is implemented in focused pull requests.

## Boundary

`cli-core` owns command-core data contracts above low-level argv token parsing.
It does not own prompts, shell loops, raw terminal control, full-screen terminal
interfaces, or hidden process writes.

Low-level flag parsing is delegated to `argv-flags`.

## Testing Harness

The testing subpath provides immutable fixture registration and a data-only
scenario runner. Scenario results contain stable diagnostic codes instead of
throwing for expected CLI behavior checks.

```ts
import * as testing from '@ismail-elkorchi/cli-core/testing';

const harness = testing.createCliHarness({
  entrypoints: {
    testing
  }
});

const result = await testing.runCliScenario(harness, {
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
```

## Entry Points

The package publishes the root entrypoint plus these subpaths:

- `@ismail-elkorchi/cli-core/help`
- `@ismail-elkorchi/cli-core/completion`
- `@ismail-elkorchi/cli-core/manifest`
- `@ismail-elkorchi/cli-core/config`
- `@ismail-elkorchi/cli-core/plugins`
- `@ismail-elkorchi/cli-core/repair`
- `@ismail-elkorchi/cli-core/testing`

## Verification

```sh
npm run check
```

The `precommit` and `prepush` scripts are manual verification commands. This
package does not install Git hooks.
