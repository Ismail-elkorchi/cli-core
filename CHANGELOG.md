# Changelog

## Unreleased

- Removed the runtime dependency on `argv-flags` and the built-in `parseCli`
  entrypoint. Integrations now provide a `CliOptionBinder` to
  `createCliInvocationParser`.
- Made parsed invocations mandatory for `runCli` and made CLI adapters accept an
  explicit invocation parser.
- Replaced parser-specific issue snapshots with binder diagnostics and indexed
  unknown-option records, with the invocation document advanced to
  `cli-core.invocation.v2`.

## 0.1.0 - 2026-06-08

- Initial public release of typed command-core primitives for TypeScript and JavaScript CLIs.
- Added command definition APIs for nested command trees, aliases, global and command options, positionals, default commands, deprecation metadata, and deterministic lookup indexes.
- Added argv parsing and semantic validation that delegates low-level flag binding to `argv-flags` while preserving command paths, positional values, pass-through tokens, warnings, and stable diagnostics.
- Added machine-readable help, version, and command manifest documents, including manifest export/import helpers for command inventories.
- Added completion payload, completion protocol, shell script, install-plan, and repair-suggestion APIs for command, option, alias, and positional discovery.
- Added explicit config discovery and resolution APIs with caller-supplied discovery hosts, memory host helpers, precedence tracking, environment capture, config-file parsing, and versioned migration support.
- Added plan/apply run APIs with handler lookup, structured run events, run results, exit-status policy, cancellation and timeout mapping, artifacts, diagnostics, and redaction by default.
- Added effect planning and application APIs with policy-controlled file, spawn, and custom effects, plus an in-memory effect host for tests and dry runs.
- Added explicit CLI adapter helpers that render structured run results to caller-supplied stdout, stderr, and exit-status hosts without hidden process exits or ambient writes.
- Added plugin manifest, compatibility, trust, capability, command-application, lazy-loading, hook-planning, and hook-execution APIs.
- Added schema descriptors, JSON Schema artifacts, schema envelopes, failure envelopes, redaction reports, and public schema exports for machine-readable payloads.
- Added testing harness APIs with fixture registries, built-in scenario fixtures, scenario replay, and public entrypoint checks.
- Added npm ESM packaging for Node `>=24` and JSR source entrypoints for TypeScript consumers.
- Added Node, Deno, Bun, package-consumer, schema, export, leakage, shell, and operating-system smoke coverage for the published surfaces.
