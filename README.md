# @ismail-elkorchi/cli-core

Structured command-core primitives for TypeScript and JavaScript CLIs.

`cli-core` compiles command definitions, parses invocations through
`argv-flags`, resolves explicit configuration input, returns structured help and
manifest documents, produces completion payloads, applies plugin command
contributions, plans or runs command handlers, reports effects and artifacts,
redacts secrets, and provides a small testing harness. It does not own prompts,
shell loops, raw terminal control, full-screen terminal UI, or hidden process
writes.

## Install

```sh
npm install @ismail-elkorchi/cli-core
deno add jsr:@ismail-elkorchi/cli-core
```

## Quickstart

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

## API Entrypoints

- `@ismail-elkorchi/cli-core`: core program, parse, validation, config, help,
  manifest, completion payload, and run APIs.
- `@ismail-elkorchi/cli-core/command`: command definition and lookup APIs.
- `@ismail-elkorchi/cli-core/adapter`: explicit argv/stdout/stderr/exit-code
  adapter helpers.
- `@ismail-elkorchi/cli-core/completion`: completion bridge, protocol, scripts,
  and install-plan data.
- `@ismail-elkorchi/cli-core/config`: config resolution and explicit discovery
  hosts.
- `@ismail-elkorchi/cli-core/effects`: effect planning and policy-controlled
  effect application.
- `@ismail-elkorchi/cli-core/help`: help and version document builders.
- `@ismail-elkorchi/cli-core/manifest`: command manifest export/import.
- `@ismail-elkorchi/cli-core/plugins`: plugin manifests, command application,
  compatibility checks, lazy loading, and hook execution.
- `@ismail-elkorchi/cli-core/repair`: repair suggestions and result envelopes
  for parse diagnostics.
- `@ismail-elkorchi/cli-core/schema`: schema descriptors, envelopes, failure
  envelopes, and redaction helpers.
- `@ismail-elkorchi/cli-core/schemas`: JSON Schema artifact index.
- `@ismail-elkorchi/cli-core/schemas/*.json`: individual JSON Schema artifacts.
- `@ismail-elkorchi/cli-core/testing`: fixture registry and scenario harness.

## Core Examples

### Define And Parse

```ts
import { defineCli, parseCli } from '@ismail-elkorchi/cli-core';

const program = defineCli({
  name: 'ship',
  commands: [{ name: 'status', aliases: ['st'] }]
});

const invocation = parseCli(program, { argv: ['st'] });
```

### Config

```ts
import { defineCli, parseCli, resolveCliConfig } from '@ismail-elkorchi/cli-core';
import {
  createMemoryConfigDiscoveryHost,
  discoverCliConfigInput
} from '@ismail-elkorchi/cli-core/config';

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
const memory = createMemoryConfigDiscoveryHost({
  files: { '/workspace/.shiprc.json': { profile: 'file', dryRun: true } },
  env: { SHIP_PROFILE: 'env' }
});
const discovered = await discoverCliConfigInput(program, {
  host: memory.host,
  scope: 'cwd_only',
  cwd: '/workspace',
  filenames: ['.shiprc.json'],
  environment: { includeConfigFields: true }
});
const argvConfig = typeof invocation.options.values.profile === 'string'
  ? { profile: invocation.options.values.profile }
  : {};
const config = resolveCliConfig(program, {
  ...discovered.input,
  argv: argvConfig
});
```

### Help And Manifest

```ts
import { createHelpDocument, defineCli, describeCli } from '@ismail-elkorchi/cli-core';
import {
  exportCommandManifest,
  importCommandManifest
} from '@ismail-elkorchi/cli-core/manifest';

const program = defineCli({
  name: 'ship',
  version: '2.0.0',
  commands: [{ name: 'status', description: 'Show service status.' }]
});

const help = createHelpDocument(program);
const manifest = importCommandManifest(exportCommandManifest(describeCli(program)));
```

### Completion Payload

```ts
import { completeCli, createCompletionPayload, defineCli } from '@ismail-elkorchi/cli-core';

const program = defineCli({
  name: 'ship',
  commands: [{ name: 'deploy', options: [{ name: 'region', type: 'string', flags: ['--region'] }] }]
});

const payload = createCompletionPayload(program, { word: 'd' });
const response = completeCli(program, { words: ['ship', '__complete', 'deploy', '--r'] });
```

The completion subpath also exposes protocol, script, and install-plan data.
Generated scripts are templates that invoke the completion protocol; consumers
should test their own shell integration before installing them for users.

### Plugins

```ts
import { defineCli } from '@ismail-elkorchi/cli-core';
import {
  applyCliPluginCommands,
  checkCliPluginCompatibility,
  createCliPluginHost,
  defineCliPluginManifest
} from '@ismail-elkorchi/cli-core/plugins';

const manifest = defineCliPluginManifest({
  name: 'ship-audit',
  version: '1.0.0',
  capabilities: ['audit'],
  commands: [{ name: 'audit', aliases: ['a'] }],
  hooks: [{ name: 'audit-prerun', event: 'prerun' }]
});

const application = applyCliPluginCommands(
  defineCli({ name: 'ship', commands: [{ name: 'status' }] }),
  [manifest],
  { allowedCapabilities: ['audit'], trustedPlugins: ['ship-audit@1.0.0'] }
);
const host = createCliPluginHost([{ manifest, load: () => ({ manifest }) }], {
  allowedCapabilities: ['audit'],
  trustedPlugins: ['ship-audit@1.0.0']
});
const compatibility = checkCliPluginCompatibility(manifest, {
  allowedCapabilities: ['audit'],
  trustedPlugins: ['ship-audit@1.0.0']
});
```

Plugin compatibility checks run before command contributions affect parsing or
hook modules load. Manifests with declared capabilities need an explicit
capability allow-list; hosts can also restrict accepted plugin identities.

### Run

```ts
import { defineCli, parseCli, runCli } from '@ismail-elkorchi/cli-core';

const program = defineCli({
  name: 'ship',
  commands: [{ name: 'deploy', positionals: [{ name: 'service' }] }]
});
const invocation = parseCli(program, { argv: ['deploy', 'api'] });

const result = await runCli(program, {
  mode: 'apply',
  invocation,
  handlers: {
    deploy: () => ({
      artifacts: [{ id: 'deploy-summary', kind: 'json', payload: { service: 'api' } }]
    })
  }
});
```

### CLI Adapter

```ts
import { defineCli } from '@ismail-elkorchi/cli-core';
import { createNodeCliAdapter, runCliMain } from '@ismail-elkorchi/cli-core/adapter';

const program = defineCli({
  name: 'ship',
  commands: [{ name: 'deploy', positionals: [{ name: 'service' }] }]
});

await runCliMain({
  program,
  mode: 'plan',
  handlers: {
    deploy: ({ invocation }) => ({
      artifacts: [{
        id: 'deploy-summary',
        kind: 'json',
        payload: { service: invocation.positionals.service ?? null }
      }]
    })
  }
}, createNodeCliAdapter(process));
```

### Testing Harness

```ts
import * as testing from '@ismail-elkorchi/cli-core/testing';

const harness = testing.createCliHarness({
  entrypoints: { testing },
  fixtures: [
    {
      id: 'example.local-fixture',
      family: 'config',
      title: 'Local fixture',
      capabilities: ['example']
    }
  ]
});
const result = await testing.runCliScenario(harness, {
  id: 'example.testing-harness',
  steps: [
    {
      kind: 'fixture-available',
      name: 'caller-provided fixture exists',
      fixtureId: 'example.local-fixture',
      expectedFamily: 'config'
    }
  ]
});
```

## Security And Side Effects

Core APIs return structured objects. They do not call `process.exit`, write to
stdout or stderr, mutate shell profiles, read implicit config files, install
completions, or execute spawn/file effects. Config discovery, CLI adapters, and
effect application require caller-supplied hosts. Spawn effects use argv arrays
and do not imply shell interpolation. Run results, failure envelopes, and schema
envelopes redact secret-like keys and common token patterns by default. Plugin
command contributions and hook modules are gated by compatibility, capability,
and optional trusted-plugin checks before they participate in parsing or running.

## Runtime Support

The npm package is built as ESM and requires Node `>=24`. JSR publishing uses the
TypeScript source entrypoints declared in `jsr.json`. The repository keeps smoke
tests for Node, Deno, and Bun imports. These checks are not exhaustive operating
system, shell, filesystem, or package-manager compatibility guarantees.

## Limitations

- Low-level argv tokenization, coercion, and flag issue semantics are delegated
  to `argv-flags`.
- Config resolution consumes explicit input. File discovery and environment
  capture happen only through caller-supplied discovery hosts.
- Completion scripts and install plans are data. Consumers decide whether and
  how to write files or update shell profiles.
- JSON Schema artifacts describe the public payload shapes shipped by this
  package. Top-level documents carry schema versions; nested diagnostics,
  events, effects, artifacts, and explanation entries are governed by their
  parent document schemas unless documented as standalone artifacts.
- Adapter APIs write stdout/stderr and set exit status only through an explicit
  caller-supplied host.
- This package is not a prompt library, shell framework, terminal UI, or process
  supervisor.

## Verification Commands

```sh
npm run lint
npm run typecheck
npm run check:runtime-policy
npm run check:workflow-policy
npm run test:core
npm run test:contracts
npm run test:examples
npm run test:integration
npm run test:security
npm run test:package
npm run test:runtime:os
npm run test:shells
npm run test:mutation:dry
npm run test:mutation:file -- src/config/path.ts
npm run test:mutation:all
npm run check:exports
npm run check:deno:source
npm run check:deno:lint
npm run check:deno:docs
npm run check:jsr
npm run check:leakage
```

Mutation commands are manual investigation tools for test-oracle strength; start
with `test:mutation:dry` when changing their configuration and use targeted file
or source-area commands before running the full mutation set. The `precommit`
and `prepush` scripts are manual verification commands. This package does not
install Git hooks.
