# @ismail-elkorchi/cli-core

Parser-independent command semantics for TypeScript and JavaScript CLIs.

`cli-core` compiles command trees, routes binder-classified command tokens,
binds positionals, creates renderer-neutral help and completion data, and
dispatches successful invocations. It does not parse flag syntax, access a
process, or generate shell scripts.

Use [`clivoke`](https://www.npmjs.com/package/clivoke) on npm or
`@ismail-elkorchi/clivoke` on JSR for the ready-made `argv-flags` integration.

## Install

```sh
npm install @ismail-elkorchi/cli-core
deno add jsr:@ismail-elkorchi/cli-core
```

## Define commands

```ts
import { createCliHelp, defineCli } from "@ismail-elkorchi/cli-core";

const program = defineCli({
  name: "ship",
  invokable: false,
  options: [
    { name: "verbose", kind: "boolean", flags: ["-v", "--verbose"] },
  ],
  commands: [{
    name: "deploy",
    aliases: ["d"],
    options: [{
      name: "region",
      kind: "value",
      flags: ["--region"],
      valueMode: "required",
      required: true,
      valueCandidates: ["eu", "us"],
      valueDescription: "Deployment region.",
    }],
    positionals: [{ name: "service" }],
  }],
});

console.log(createCliHelp(program, ["deploy"]));
```

Definitions are closed in TypeScript and at runtime. Compilation returns an
immutable program or throws one `CliDefinitionError` with structured issues.
Global and ancestor options are inherited by descendants. A command cannot
declare both child commands and positionals because the same token would be
ambiguous. Set `invokable: false` on a grouping command that requires a child;
non-invokable leaves are rejected.

The root accepts the same positional and passthrough metadata as child
commands. This supports programs such as `formatter <file>` and
`runner -- node app.js` without an artificial subcommand. Set
`acceptsPassthroughArguments: true` when tokens after `--` belong to the
selected command.

## Connect an option grammar

`createCliInvocationParser()` accepts a binder with two operations:

- `scan()` classifies recognized option spans, ordinary arguments, unknown
  flags, and `--` without decoding values.
- `bind()` performs the final option parse after command tokens are removed.

Both operations receive the visible option metadata and an `argvIndexes` map
back to the complete argv. Core requires a scan to be an ordered, exclusive
partition of that argv and requires binding to agree about specified options,
positionals, post-`--` arguments, and unknown flags. Recognized and unknown
members of one short cluster share an argv element and are distinguished by
their offsets. This keeps raw option grammar in one integration while letting
core route commands without interpreting flag syntax.

Command-local options must follow the command that defines them. Ancestor
options may appear around descendant command tokens because descendants inherit
them. An unknown option before a child command stops routing: core cannot safely
guess whether a following token is its value.

For an HTTP endpoint, TUI, or other non-argv input, use
`createCliInvocation()` with already decoded option and positional values. Its
optional `sourceId` can identify the integration that created the invocation.

## Results and dispatch

Ready invocations expose a top-level `commandKey` discriminant, the compiled
`command`, and a `source` discriminated as `argv` or `structured`. Literal
programs produce a union per invokable command, so handler inputs narrow to
their exact command key. Handler maps must cover every invokable key. Failed
invocations contain diagnostics and unknown flags, never partial values.

```ts
import { dispatchCli, type CliInvocationResult } from "@ismail-elkorchi/cli-core";

async function handle(result: CliInvocationResult) {
  if (result.status === "ready") {
    await dispatchCli(result, {
      "ship deploy": ({ invocation }) => {
        console.log(invocation.positionalValues.service);
      },
    }, undefined);
  }
}
```

`createCliHelp()` and `completeCli()` return `undefined` for an unknown command
path. Completion returns actual command, alias, flag, and finite option-value
candidates; positional definitions remain metadata rather than fake values.
Value descriptions, implicit-value labels, and explicit default labels remain
opaque presentation strings; the core does not interpret parser-specific
values.

## Runtime support

- ESM only
- Node.js 24 or later
- Deno 2.6 or later
- Bun 1.3 or later
- Zero runtime dependencies

## License

MIT
