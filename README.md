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

`createCliInvocationParser()` accepts a `CliOptionBinder` that creates one
isolated grammar session per invocation:

- `create(argv)` receives the immutable original argument snapshot.
- The session's `next(scope)` classifies one contiguous span under the current
  command's option scope. It advances `nextIndex` and reports indexed options,
  ordinary arguments, integration controls, unknown flags, diagnostics, and
  explicitly unclassified syntax.
- The session's `bind(scope)` decodes its retained occurrences once, after the
  command is selected. It must not reparse raw argv to rediscover ownership.

Core validates span ownership and current-scope option membership, adopts its
own immutable classification, and resolves child command tokens as traversal
advances. `route()` returns this classification without decoding;
`bind(route)` accepts only a route produced by the same parser. `parse()` performs
both steps. Repeated binding of a route never repeats decoder effects.

Recognized options with malformed values retain command context and diagnostics;
they cannot produce a ready invocation. Unclassifiable syntax or an unknown flag
before a child command stops routing. The remaining suffix stays unclassified,
so an option value cannot be reinterpreted as a help or version control.

Place command-local flags after the command that declares them. Ancestor flags
may appear around descendant command tokens because descendants inherit those
options. Integration controls are classified separately from domain options;
they do not need fake entries in the command definition.

Use `createCliInvocation()` when an adapter already has decoded option and
positional values. The returned invocation records a `structured` source and
can carry an application-defined `sourceId`. This constructor validates names,
presence and positional shape; integrations must decode and validate option
values before calling it. Arbitrary decoded application objects remain owned by
the decoder. Custom nested diagnostic details likewise remain application-owned.
Framework-owned arrays, records, and diagnostic containers are snapshots;
accessors and custom array behavior are rejected rather than executed.

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
