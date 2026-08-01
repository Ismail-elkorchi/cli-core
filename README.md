# @ismail-elkorchi/cli-core

Structured command-core primitives for TypeScript and JavaScript CLIs.

`cli-core` compiles command definitions, routes commands through an explicit
option-binding interface, resolves configuration input, returns structured help
and manifest documents, produces completion payloads, applies plugin command
contributions, and plans or runs normalized invocations. It has no runtime
dependencies and does not implement low-level argv parsing or select a parser
implementation.

## Install

```sh
npm install @ismail-elkorchi/cli-core
deno add jsr:@ismail-elkorchi/cli-core
```

## Quickstart

```ts
import { createHelpDocument, defineCli } from '@ismail-elkorchi/cli-core';

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

const help = createHelpDocument(program, ['deploy']);
```

## API Entrypoints

- `@ismail-elkorchi/cli-core`: core program, invocation, validation, config, help,
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

### Connect An Option Binder

```ts
import {
  createCliInvocationParser,
  defineCli,
  type CliOptionBinder
} from '@ismail-elkorchi/cli-core';

declare const bindOptions: CliOptionBinder;

const program = defineCli({
  name: 'ship',
  commands: [{ name: 'status', aliases: ['st'] }]
});

const parser = createCliInvocationParser(bindOptions);
const invocation = parser.parse(program, { argv: ['st'] });
```

`CliOptionBinder` is the integration boundary. It receives the matched command,
its options, and the remaining argv. The command object is stable and can key a
compiled-parser cache. The binder returns decoded values, raw positionals,
post-`--` tokens, indexed unknown options, and translated diagnostics. A
higher-level package can adapt an argv parser once and provide the resulting
`CliInvocationParser` to the rest of the application.

### Config

```ts
import { defineCli, resolveCliConfig } from '@ismail-elkorchi/cli-core';
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
const config = resolveCliConfig(program, {
  ...discovered.input,
  argv: { profile: 'prod' }
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
import {
  defineCli,
  runCli,
  type ParsedInvocation
} from '@ismail-elkorchi/cli-core';

declare const invocation: ParsedInvocation;

const program = defineCli({
  name: 'ship',
  commands: [{ name: 'deploy', positionals: [{ name: 'service' }] }]
});
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
import type { CliInvocationParser } from '@ismail-elkorchi/cli-core';
import { createNodeCliAdapter, runCliMain } from '@ismail-elkorchi/cli-core/adapter';

declare const parser: CliInvocationParser;

const program = defineCli({
  name: 'ship',
  commands: [{ name: 'deploy', positionals: [{ name: 'service' }] }]
});

await runCliMain({
  program,
  parser,
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
and optional trusted-plugin checks before they participate in invocation
handling or running.

## Runtime Support

The npm package is built as ESM and requires Node `>=24`. JSR publishing uses the
TypeScript source entrypoints declared in `jsr.json`. The repository keeps smoke
tests for Node, Deno, and Bun imports. These checks are not exhaustive operating
system, shell, filesystem, or package-manager compatibility guarantees.

## Limitations

- Raw argv parsing is not built in. Integrations provide a `CliOptionBinder` and
  use `createCliInvocationParser` to combine it with command routing and
  positional binding.
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
