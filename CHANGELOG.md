# Changelog

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
- Moved `argv-flags`, process, and shell integration to `@ismail-elkorchi/cli`.
- Reduced the package to one public entrypoint and added negative public type
  tests plus offline packed consumers for Node, Deno, and Bun.

## 0.1.0 - 2026-06-08

- Initial release.
