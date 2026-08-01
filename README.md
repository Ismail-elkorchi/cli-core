# @ismail-elkorchi/cli-core

Parser-independent command semantics for TypeScript and JavaScript CLIs.

`cli-core` compiles command trees, routes command tokens, binds positionals,
creates help and completion data, and dispatches successful invocations. It has
no runtime dependencies and deliberately does not parse flags, access a
process, discover configuration, generate shell scripts, load plugins, or own
an effects framework.

Use `@ismail-elkorchi/cli` when you want the ready-made integration with
`argv-flags` and an explicit process adapter.

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
  options: [
    { name: "verbose", flags: ["-v", "--verbose"], valueMode: "none" },
  ],
  commands: [
    {
      name: "deploy",
      aliases: ["d"],
      options: [
        {
          name: "region",
          flags: ["--region"],
          valueMode: "required",
          valueLabel: "region",
        },
      ],
      positionals: [{ name: "service" }],
    },
  ],
});

const help = createCliHelp(program, ["deploy"]);
console.log(help.usage);
```

Option definitions in this package are presentation metadata. A binder owns
decoding, defaults, repetition, and token grammar. `defineCli` copies and
freezes a valid definition. Invalid or ambiguous definitions throw one
`CliDefinitionError` containing structured issues; no partial program is
returned.

## Connect an option binder

```ts
import {
  createCliInvocationParser,
  type CliOptionBinder,
} from "@ismail-elkorchi/cli-core";

const bindOptions: CliOptionBinder = ({ options, argv }) => ({
  status: "bound",
  values: {},
  specified: Object.fromEntries(options.map((option) => [option.name, false])),
  positionals: argv,
  afterDoubleDash: [],
  unknownFlags: [],
});

const parser = createCliInvocationParser(bindOptions);
const result = parser.parse(program, { argv: ["deploy", "api"] });

if (result.status === "parsed") {
  console.log(result.command.key, result.positionalValues.service);
} else {
  console.error(result.diagnostics);
}
```

A binder receives an `argvIndexes` array that maps each remaining token back to
the complete invocation after command tokens are removed. This preserves exact
locations even when global flags precede a command.

A failed binder result contains diagnostics only. Consequently, rejected
invocations never expose partial option values, defaults, or positional values
as successful-looking state. Unknown options retain their complete argv index,
and tokens after `--` remain separate.

## Help, completion, and dispatch

`createCliHelp` returns renderer-neutral help data. `completeCli` returns
command-local command, alias, flag, and positional candidates.
`findCliCommandForArgv` applies the same routing rules as invocation parsing to
an incomplete argv prefix, so higher-level completion adapters do not need a
second command router. Shell protocol handling and script generation belong in
the higher-level package.

`dispatchCli` accepts only a successfully parsed invocation:

```ts
import { dispatchCli } from "@ismail-elkorchi/cli-core";

if (result.status === "parsed") {
  const deployed = await dispatchCli(
    result,
    {
      "ship deploy": ({ invocation }) => invocation.positionalValues.service,
    },
    undefined,
  );
  console.log(deployed);
}
```

Handler errors propagate unchanged. Missing handlers throw
`CliHandlerNotFoundError`. Process exit codes, output, retries, cancellation,
events, and effects remain application or adapter concerns.

## Runtime support

- ESM only
- Node.js 24 or later
- Deno 2.6 or later
- Bun 1.3 or later
- Zero runtime dependencies

## License

MIT
