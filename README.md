# cli-core

Typed command-core primitives for TypeScript and JavaScript CLIs.

## Current Status

This package is in active implementation. The current public surface includes
stable package entrypoints, contract metadata, command program compilation,
argv binding through `argv-flags`, help/version documents, command manifests,
manifest import/export, config resolution with provenance, completion payloads
and scripts, repair suggestions, plugin manifest/host contracts, run result
envelopes, events, effects, artifacts, exit status policy, and a testing harness
for data-only fixture and entrypoint scenarios. Public schema envelopes,
failure envelopes, and secret redaction are available. Full runtime matrix
behavior is not part of the current public surface.

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

## Plugins

Plugin APIs are manifest-first. Consumers can inspect compatibility and hook
ordering without loading plugin code. Loaders run only when a plugin or hook is
used, and loader or hook failures become typed diagnostics.

```ts
import {
  checkCliPluginCompatibility,
  createCliPluginHost,
  defineCliPluginManifest
} from '@ismail-elkorchi/cli-core';

const manifest = defineCliPluginManifest({
  name: 'ship-audit',
  version: '1.0.0',
  capabilities: ['audit'],
  hooks: [{ name: 'audit-prerun', event: 'prerun' }]
});

const host = createCliPluginHost([
  {
    manifest,
    load: () => ({
      manifest,
      hooks: {
        'audit-prerun': () => ({
          effects: [{ kind: 'audit.record', data: { ok: true } }]
        })
      }
    })
  }
], { allowedCapabilities: ['audit'] });

const compatibility = checkCliPluginCompatibility(manifest, { runtime: 'node' });
const plan = host.planHooks('prerun');
const run = await host.runHooks('prerun');
```

## Run Planning And Apply

`runCli` returns a replayable result envelope. Plan mode records intended
effects without invoking handlers. Apply mode invokes an explicit handler for the
matched command and returns effects, artifacts, diagnostics, ordered events, and
an exit status selected from the exit policy. It does not call `process.exit` or
write to stdout/stderr.

```ts
import { defineCli, parseCli, runCli } from '@ismail-elkorchi/cli-core';

const program = defineCli({
  name: 'ship',
  commands: [{ name: 'deploy', positionals: [{ name: 'service' }] }]
});

const invocation = parseCli(program, { argv: ['deploy', 'api'] });
const plan = await runCli(program, {
  mode: 'plan',
  invocation,
  effects: [{ kind: 'spawn', command: 'ship', argv: ['deploy', 'api'] }]
});

const apply = await runCli(program, {
  mode: 'apply',
  invocation,
  handlers: {
    deploy: () => ({
      artifacts: [{ id: 'deploy-summary', kind: 'json', data: { service: 'api' } }]
    })
  }
});
```

## Schema And Redaction

Schema helpers expose stable schema/version descriptors and wrappers for
machine-readable payloads. Failure envelopes and run results redact secret-like
keys and common token patterns by default. Redaction is data-only; consumers
choose where to store, log, or display the redacted envelopes.

```ts
import { defineCli, parseCli, runCli } from '@ismail-elkorchi/cli-core';
import {
  createCliFailureEnvelope,
  createCliSchemaEnvelope,
  describeCliSchemas,
  redactCliSecrets
} from '@ismail-elkorchi/cli-core/schema';

const program = defineCli({ name: 'ship', commands: [{ name: 'deploy' }] });
const invocation = parseCli(program, { argv: ['deploy'] });
const run = await runCli(program, {
  mode: 'plan',
  invocation,
  effects: [{ kind: 'spawn', command: 'ship', argv: ['deploy'], env: { SHIP_TOKEN: 'abc123' } }]
});

const schemas = describeCliSchemas();
const envelope = createCliSchemaEnvelope({
  payloadSchemaVersion: run.schemaVersion,
  data: run
});
const failure = createCliFailureEnvelope({
  kind: 'policy_denial',
  diagnostics: run.diagnostics
});
const redacted = redactCliSecrets({ password: 'secret', safe: 'visible' });
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
- `@ismail-elkorchi/cli-core/schema`
- `@ismail-elkorchi/cli-core/testing`

## Runtime Support

The local and CI runtime subset loads the root package and every public subpath
in Node, Deno, and Bun, then exercises a data-only command scenario. This is a
runtime smoke contract, not a full runtime matrix or performance claim.

## Verification

```sh
npm run check
```

The `precommit` and `prepush` scripts are manual verification commands. This
package does not install Git hooks.
