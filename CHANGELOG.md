# Changelog

## 0.3.0 - 2026-08-01

- Moved all raw option-token classification behind a scanner/binder contract
  and validate that scanning and final binding agree.
- Made ancestor options explicit descendants' options, rejected ambiguous
  child-command/positional definitions, and made pre-command local options fail
  consistently.
- Added structured invocations, discriminated runtime diagnostics, canonical
  command deprecation warnings, exact alias-use history, and prototype-safe
  positional records.
- Added a literal `commandKey` discriminant and command-specific handler maps.
- Retained neutral option defaults, false flags, repetition, multiplicity, and
  finite values for help and completion. Unknown help and completion paths no
  longer fall back to the root command.
- Corrected the integration package name to `clivoke` on npm and
  `@ismail-elkorchi/clivoke` on JSR.

## 0.2.0 - 2026-08-01

- Contracted the package to command compilation and lookup, invocation routing,
  positional binding, diagnostics, renderer-neutral help, completion candidates,
  and small handler dispatch.
- Replaced diagnostic-bearing partial programs with immutable programs or a
  structured `CliDefinitionError`.
- Replaced boolean `ok` results with discriminated `status` results. Failed
  invocations no longer expose partial option or positional values.
- Replaced parser-shaped option definitions with parser-independent option
  presentation metadata and retained `CliOptionBinder` as the parsing boundary.
- Allowed global flags before command tokens and replaced contiguous argv
  offsets with an exact per-element index map for binders.
- Exposed argv-prefix command lookup from the invocation router so completion
  adapters share command and option-span classification.
- Removed public lookup indexes, schema versions, manifests, JSON Schemas,
  configuration discovery and resolution, plugins, effects, repair suggestions,
  workflow-style run results, process adapters, shell scripts, package metadata,
  and the public testing framework.
- Moved `argv-flags`, process, and shell integration out of this package.
- Reduced the package to one public entrypoint and added negative public type
  tests plus offline packed consumers for Node, Deno, and Bun.

## 0.1.0 - 2026-06-08

- Initial release.
