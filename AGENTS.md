# AGENTS

## Boundaries

- Keep command compilation, command routing, positional binding, diagnostics,
  help data, completion candidates, and small handler dispatch in this package.
- Keep token-level option parsing behind `CliOptionBinder`.
- Keep process access, shell integration, output rendering, configuration,
  plugins, effects, and workflow orchestration outside this package.
- Do not add runtime dependencies or default-entrypoint `node:*` imports.
- Do not return partial programs or successful-looking values after failure.

## Quality

- Keep TypeScript strict and public definitions closed.
- Add focused tests for behavior changes and regressions.
- Keep tests deterministic and offline across Node, Deno, and Bun.
- Run `npm run check` before declaring work complete.
- Run `npm run test:mutation` when changing command validation, routing,
  positional binding, or diagnostic policy.
