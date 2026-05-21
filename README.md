# cli-core

Typed command-core primitives for TypeScript and JavaScript CLIs.

## Current Status

This package is in active implementation. The current public surface includes
stable package entrypoints, contract metadata, command program compilation,
argv binding through `argv-flags`, help/version documents, command manifests,
manifest import/export, config resolution with provenance, completion payloads
and scripts, repair suggestions, and a testing harness for data-only fixture and
entrypoint scenarios. Plugin and run behavior are not part of the current public
surface.

## Boundary

`cli-core` owns command-core data contracts above low-level argv token parsing.
It does not own prompts, shell loops, raw terminal control, full-screen terminal
interfaces, or hidden process writes.

Low-level flag parsing is delegated to `argv-flags`.

## Command Model

Use `defineCli` to compile command definitions into an immutable program, then
use `parseCli` to match a command path, bind global and local options, bind
positionals, and preserve tokens after `--`.

```ts
import { defineCli, parseCli, validateCli } from '@ismail-elkorchi/cli-core';

const program = defineCli({
  name: 'ship',
  options: [{ name: 'verbose', type: 'boolean', flags: ['--verbose', '-v'] }],
  commands: [
    {
      name: 'deploy',
      aliases: ['d'],
      options: [{ name: 'region', type: 'string', flags: ['--region'], required: true }],
      positionals: [{ name: 'service' }]
    }
  ]
});

const invocation = parseCli(program, {
  argv: ['d', '--verbose', '--region', 'eu', 'api']
});
const validation = await validateCli(program, invocation);
```

## Help And Manifests

`cli-core` exposes help, version, and manifest data as structured documents.
Rendering those documents to a terminal, file, or service is left to consumers.

```ts
import {
  createHelpDocument,
  createVersionDocument,
  defineCli,
  describeCli
} from '@ismail-elkorchi/cli-core';
import {
  exportCommandManifest,
  importCommandManifest
} from '@ismail-elkorchi/cli-core/manifest';

const program = defineCli({
  name: 'ship',
  version: '2.0.0',
  commands: [{ name: 'status', aliases: ['st'], description: 'Show service status.' }]
});

const help = createHelpDocument(program);
const version = createVersionDocument(program);
const manifest = importCommandManifest(exportCommandManifest(describeCli(program)));
```

## Config Resolution

Config resolution is explicit and replayable. Values are layered as built-in
defaults, workspace defaults, config file values, environment values, then argv
values. The result includes selected values, provenance entries, explanations,
and discovery metadata.

```ts
import { defineCli, parseCli, resolveCliConfig } from '@ismail-elkorchi/cli-core';

const program = defineCli({
  name: 'ship',
  config: {
    fields: [
      { name: 'profile', type: 'string', default: 'default', env: 'SHIP_PROFILE' },
      { name: 'dryRun', type: 'boolean', default: false }
    ]
  },
  commands: [{ name: 'deploy', options: [{ name: 'profile', type: 'string', flags: ['--profile'] }] }]
});

const invocation = parseCli(program, { argv: ['deploy', '--profile', 'prod'] });
const config = resolveCliConfig(program, {
  workspaceDefaults: { profile: 'workspace' },
  env: { SHIP_PROFILE: 'env' },
  argv: invocation.options.values
});
```

## Completion And Repair

Completion APIs return machine-readable candidates and shell-specific script
documents. Install plans are data envelopes describing file/profile changes;
they do not write files or mutate shell configuration.

Repair APIs map parse diagnostics to stable suggestion codes. When callers pass
the compiled program, unknown command and unknown option repairs can include a
nearby replacement candidate.

```ts
import {
  createCompletionInstallPlan,
  createCompletionPayload,
  createCompletionScript,
  defineCli,
  parseCli,
  suggestRepairs
} from '@ismail-elkorchi/cli-core';

const program = defineCli({
  name: 'ship',
  commands: [
    {
      name: 'deploy',
      aliases: ['d'],
      options: [{ name: 'region', type: 'string', flags: ['--region'] }],
      positionals: [{ name: 'service' }]
    }
  ]
});

const completion = createCompletionPayload(program, { word: 'd' });
const bash = createCompletionScript(program, 'bash');
const installPlan = createCompletionInstallPlan(program, 'fish');
const repairs = suggestRepairs(parseCli(program, { argv: ['deply', 'api'] }), program);
```

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
