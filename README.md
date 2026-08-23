# @ismail-elkorchi/cli-core

Build reusable, typed command systems for argv parsers, graphical interfaces,
HTTP endpoints, tests, and other invocation sources.

`cli-core` compiles immutable command trees, routes scanner-classified command
tokens, validates decoded invocations, binds positional values, produces help
and completion data, and dispatches command-specific handlers. Its explicit
scanner and binder boundary lets each integration choose its own flag grammar.

[Clivoke](https://github.com/Ismail-elkorchi/clivoke) combines `cli-core` with
[`argv-flags`](https://www.npmjs.com/package/argv-flags) and adds process and
shell integration. Its README lists the available installation methods and
end-to-end adapters.

## Install

```sh
npm install @ismail-elkorchi/cli-core
deno add jsr:@ismail-elkorchi/cli-core
```

## Quick start

Define the command tree once, then use it from structured adapters, help,
completion, and dispatch:

```ts
import {
  createCliHelp,
  createCliInvocation,
  defineCli,
  dispatchCli,
} from "@ismail-elkorchi/cli-core";

const program = defineCli({
  name: "ship",
  invokable: false,
  examples: [{
    usage: "ship deploy billing --region eu",
    description: "Deploy the billing service in Europe.",
  }],
  options: [
    { name: "verbose", kind: "boolean", flags: ["-v", "--verbose"] },
  ],
  commands: [{
    name: "deploy",
    aliases: ["d"],
    description: "Deploy one service.",
    options: [{
      name: "region",
      kind: "value",
      flags: ["--region"],
      valueMode: "required",
      required: true,
      valueCandidates: ["eu", "us"],
    }],
    positionals: [{ name: "service" }],
  }],
});

const help = createCliHelp(program, ["deploy"]);
if (help === undefined) throw new Error("deploy help is unavailable");

const invocation = createCliInvocation(program, {
  sourceId: "deployment-api",
  commandPath: ["deploy"],
  optionValues: { region: "eu" },
  specifiedOptions: { verbose: false, region: true },
  positionalValues: { service: "billing" },
});

if (invocation.status === "invalid") {
  throw new Error(invocation.diagnostics.map(({ message }) => message).join("\n"));
}

await dispatchCli(invocation, {
  "ship deploy": ({ invocation: deploy }) => ({
    service: deploy.positionalValues.service,
    region: deploy.optionValues.region,
  }),
}, undefined);
```

Definitions are closed in TypeScript and at runtime. `defineCli()` returns an
immutable `CliProgram` or throws one `CliDefinitionError` containing all
definition issues found in the tree.

## Command model

Options declared on the root are global. Options declared on a command are
inherited by its descendants, preserving where each option originated for help
and completion.

Every command has a stable canonical key such as `ship deploy`. Set
`invokable: false` on a grouping command that requires a child command. Each
command chooses child-command routing or positional binding, keeping command
tokens unambiguous.

The root and child commands share the same positional and passthrough model.
This supports shapes such as `formatter <file>`, `archive <inputs...>`, and
`runner -- node app.js` directly. Set `acceptsPassthroughArguments: true` when
post-`--` tokens belong to the selected command.

Option definitions contain parser-neutral facts used by routing and
presentation: flag spellings, value mode, requiredness, repetition,
multiplicity, defaults, false flags, finite value candidates, and descriptive
labels. Integrations remain responsible for decoding option values.

## Connect an option grammar

`createCliInvocationParser()` accepts a `CliOptionBinder` with two operations:

- `scan()` classifies recognized option spans, ordinary arguments, unknown
  flags, and `--` without decoding values.
- `bind()` performs the final option parse after command tokens are removed.

Both operations receive the options visible to the current command, the argv
elements being classified, and an `argvIndexes` map back to the complete input.
Core validates that scanning is an ordered, exclusive partition and that final
binding agrees about specified options, positionals, unknown flags, and
post-terminator arguments.

Place command-local flags after the command that declares them. Ancestor flags
may appear around descendant command tokens because descendants inherit those
options. An unknown flag before a child command stops routing so its following
token is never guessed to be a command or value.

Use `createCliInvocation()` when an adapter already has decoded option and
positional values. The returned invocation records a `structured` source and
can carry an application-defined `sourceId`.

## Results and diagnostics

A ready invocation exposes:

- `commandKey` as the command-specific discriminant;
- the compiled `command`;
- decoded option and positional values;
- explicit option-presence information;
- used aliases and deprecation warnings;
- passthrough arguments and collected unknown flags;
- an `argv` or `structured` source.

Literal definitions produce a union for every invokable command, so handlers
receive the exact command key they implement. `CliHandlers` requires every
invokable key. Invalid results contain structured diagnostics and unknown flags
without partial values.

Core diagnostics are discriminated by `source` and `code`. Option integrations
can create immutable option diagnostics with `createCliOptionDiagnostic()`.

## Help, completion, and dispatch

`createCliHelp()` returns renderer-neutral usage, examples, command, alias,
positional, and option data. `completeCli()` returns command, alias, flag, and finite
option-value candidates. Both return `undefined` for an unknown canonical
command path.

`dispatchCli()` sends a ready invocation to its canonical handler and returns
the handler result. Handler errors propagate to the integration that owns
application error policy.

## Runtime support

- ESM
- Node.js 24 or later
- Deno 2.6 or later
- Bun 1.3 or later
- Zero runtime dependencies

## License

MIT
