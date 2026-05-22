# AGENTS

## Boundaries

- Keep command semantics, config, manifests, completion, plugins, diagnostics,
  run results, effects, and testing helpers in this package.
- Keep low-level argv token parsing delegated to `argv-flags`.
- Do not add prompt loops, raw terminal control, or full-screen terminal UI.
- Do not use hidden `process.exit()`, stdout, or stderr writes as truth
  surfaces.
- Do not copy private coordination notes or private filesystem paths into
  public files.

## Source Layout

- `src/index.ts` is the root public entrypoint.
- Feature-owned modules live under `src/{adapter,help,completion,manifest,config,effects,plugins,repair,run,schema,testing}`.
- Internal code may live under `src/internal`, but public consumers must never
  import from it.

## Commands

- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:acceptance`
- `npm run test:conformance`
- `npm run check`

Use targeted tests while developing; reserve broad checks for PR gates and
larger release checks.
