# cli-core

Typed command-core primitives for TypeScript and JavaScript CLIs.

## What It Is

`cli-core` is a typed command-core package for CLIs that need replayable,
machine-readable behavior. It compiles command definitions, parses invocations
through `argv-flags`, resolves explicit config input, describes help/version and
manifest documents, generates completion payloads and scripts, suggests repairs,
checks plugin manifests, plans or applies command runs, emits typed effects and
artifacts, redacts secrets, and provides data-only testing fixtures.

## Boundary

`cli-core` owns command-core data contracts above low-level argv token parsing.
It does not own prompts, shell loops, raw terminal control, full-screen terminal
interfaces, or hidden process writes.

Low-level flag tokenization, coercion, and flag issue semantics are delegated to
`argv-flags`; `cli-core` binds those parsed values to command, positional,
config, repair, and run surfaces.

## Quickstart

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

## API Overview

- Root: `defineCli`, `parseCli`, `resolveCliConfig`, `validateCli`, `runCli`,
  `describeCli`, plus shared public types.
- `help`: structured help and version documents.
- `completion`: completion payloads, shell scripts, and install plans as data.
- `manifest`: command manifest export/import.
- `config`: config resolution inputs, provenance, migrations, and explanations.
- `effects`: explicit policy-controlled effect planning/application hosts and
  reports.
- `plugins`: plugin manifests, compatibility checks, lazy loading, hook plans,
  hook execution results, and plugin diagnostics.
- `repair`: stable repair suggestions for parse diagnostics.
- `schema`: schema descriptors/envelopes, failure envelopes, and redaction.
- `testing`: fixture registry and data-only scenario harness.

## Command Model

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

Completion APIs return machine-readable candidates, bridge responses from shell
words/current cursor state, and shell-specific script documents. The bridge uses
the same `__complete` protocol described by generated scripts, and stops
completion once a pass-through boundary is reached. Install plans are data
envelopes describing file/profile changes; they do not write files or mutate
shell configuration.

Repair APIs map parse diagnostics to stable suggestion codes. When callers pass
the compiled program, unknown command and unknown option repairs can include a
nearby replacement candidate.

```ts
import {
  completeCli,
  createCompletionCommand,
  createCompletionInstallPlan,
  createCompletionPayload,
  createCompletionRequest,
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
const bridge = completeCli(program, createCompletionRequest({ words: ['ship', '__complete', 'deploy', '--r'] }));
const command = createCompletionCommand(program);
const bash = createCompletionScript(program, 'bash');
const installPlan = createCompletionInstallPlan(program, 'fish');
const repairs = suggestRepairs(parseCli(program, { argv: ['deply', 'api'] }), program);
```

## Plugins

Plugin APIs are manifest-first. Consumers can inspect compatibility, apply
compatible plugin command contributions, and plan hook ordering without loading
plugin code. Rejected plugin commands produce diagnostics before they affect
parsing. Accepted plugin commands preserve provenance in the compiled program,
help documents, completion candidates, and command manifests. Loaders run only
when a plugin or hook is used, and loader or hook failures become typed
diagnostics.

```ts
import {
  applyCliPluginCommands,
  checkCliPluginCompatibility,
  createCliPluginHost,
  defineCliPluginManifest
} from '@ismail-elkorchi/cli-core';

const manifest = defineCliPluginManifest({
  name: 'ship-audit',
  version: '1.0.0',
  capabilities: ['audit'],
  commands: [{ name: 'audit', aliases: ['a'], description: 'Inspect deployment history.' }],
  hooks: [{ name: 'audit-prerun', event: 'prerun' }]
});
const application = applyCliPluginCommands({
  name: 'ship',
  commands: [{ name: 'status' }]
}, [manifest], { allowedCapabilities: ['audit'] });

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
const program = application.program;
const plan = host.planHooks('prerun');
const run = await host.runHooks('prerun');
```

## Run Planning And Apply

`runCli` returns a replayable result envelope. Plan mode records intended
effects without invoking handlers. Apply mode invokes an explicit handler for the
matched command and returns effects, artifacts, diagnostics, ordered events, and
an exit status selected from the exit policy. It does not call `process.exit` or
write to stdout/stderr. A request can include an explicit plugin host; lifecycle
hook effects and diagnostics are then folded into the same `RunResult` without
global plugin state.

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

## Effect Application

Run effects are still data by default. Consumers that want to apply effects must
call the explicit effects API with a host and policy. The memory host is useful
for tests and adapters because it records file and spawn effects without touching
the real filesystem or launching processes.

```ts
import { applyCliEffects, createMemoryEffectHost } from '@ismail-elkorchi/cli-core/effects';

const memory = createMemoryEffectHost();
const report = await applyCliEffects({
  effects: [{ kind: 'write_file', path: 'deploy.json', content: '{"ok":true}' }],
  host: memory.host,
  policy: { allowWriteFile: true }
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
- `@ismail-elkorchi/cli-core/effects`
- `@ismail-elkorchi/cli-core/plugins`
- `@ismail-elkorchi/cli-core/repair`
- `@ismail-elkorchi/cli-core/schema`
- `@ismail-elkorchi/cli-core/testing`

## Runtime Support

The local and CI runtime subset loads the root package and every public subpath
in Node, Deno, and Bun, then exercises a data-only command scenario. This is a
runtime smoke contract, not a full runtime matrix or performance claim.

## Security Model

The package returns data. It does not call `process.exit`, write to stdout or
stderr, mutate shell profiles, read implicit config files, install completions,
or execute spawn/file effects for consumers. Spawn effects use argv arrays and
do not imply shell interpolation. Run results, failure envelopes, and schema
envelopes redact secret-like keys and common token patterns by default.

## Limitations

- Runtime checks are a Node/Deno/Bun smoke subset, not exhaustive operating
  system, shell, filesystem, or package-manager compatibility proof.
- Benchmark tests use conservative regression budgets for representative large
  data paths; they are not throughput guarantees.
- Config resolution consumes explicit input. File discovery and environment
  capture are caller responsibilities.
- Completion install plans describe changes as data. Consumers decide whether
  and how to write files or update shell profiles.
- Plugin APIs validate manifests, apply compatible command contributions, and
  isolate loader/hook faults.

## Verification

```sh
npm run check
```

The `precommit` and `prepush` scripts are manual verification commands. This
package does not install Git hooks.
