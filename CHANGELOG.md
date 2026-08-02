# Changelog

## 0.2.0 - 2026-08-01

- Added neutral value-description and implicit-value labels to option and help
  metadata, rejected labels that contradict the option facts, and narrowed
  dispatch to the command-key behavior it uses.
- Moved all raw option-token classification behind a scanner/binder contract
  and validate that scanning and final binding agree.
- Made ancestor options explicit descendants' options, rejected ambiguous
  child-command/positional definitions, and made pre-command local options fail
  consistently.
- Added structured invocations, discriminated runtime diagnostics, canonical
  command deprecation warnings, exact alias-use history, and prototype-safe
  positional records.
- Structured invocation validation rejects unsupported properties and
  accessors without executing them, using an invocation diagnostic rather than
  mislabeling the failure as binder output.
- Added a literal `commandKey` discriminant and command-specific handler maps.
- Made successful invocations a distributed `CliInvocation` union with explicit
  argv or structured sources and complete handler maps.
- Added root positionals and passthrough arguments plus explicit non-invokable
  command groups that require a child before binding.
- Strengthened scanner validation to require ordered, exclusive argv ownership
  and exact agreement with bound option presence.
- Rejected required options reported as absent and sparse flag or value-candidate
  arrays.
- Retained neutral option defaults, false flags, repetition, multiplicity, and
  finite values for help and completion. Unknown help and completion paths no
  longer fall back to the root command.
- Stopped inferring default-value metadata from multiplicity; integrations now
  state independently whether an option materializes a value when absent.
- Corrected the integration package name to `clivoke` on npm and
  `@ismail-elkorchi/clivoke` on JSR.
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
