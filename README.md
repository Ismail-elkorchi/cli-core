# cli-core

Typed command-core primitives for TypeScript and JavaScript CLIs.

## Current Status

This package is at the package-foundation stage. The current public surface is
limited to stable package entrypoints and contract metadata while command,
config, completion, plugin, run, and testing behavior is implemented in focused
pull requests.

## Boundary

`cli-core` owns command-core data contracts above low-level argv token parsing.
It does not own prompts, shell loops, raw terminal control, full-screen terminal
interfaces, or hidden process writes.

Low-level flag parsing is delegated to `argv-flags`.

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
