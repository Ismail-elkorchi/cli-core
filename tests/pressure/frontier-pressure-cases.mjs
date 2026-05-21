export const frontierPressureCases = Object.freeze([
  Object.freeze({
    id: 'commander-pass-through-help-exit',
    competitor: 'Commander',
    sourceUrl: 'https://tj.github.io/commander.js/',
    pressure: 'Pass-through operands, help after errors, and output or exit override behavior are expected in mature Node CLI frameworks.',
    cliCoreDecision: 'Keep parsing, help, diagnostics, effects, and exit status as structured data; adapters may render or exit explicitly.',
    affectedSurface: Object.freeze(['parseCli', 'createHelpDocument', 'runCli', 'effects']),
    frontierAreas: Object.freeze(['effect-application', 'cli-adapter']),
    assertions: Object.freeze(['pass-through preserved as data', 'help and exit remain explicit data surfaces'])
  }),
  Object.freeze({
    id: 'yargs-command-groups-completion',
    competitor: 'Yargs',
    sourceUrl: 'https://yargs.js.org/',
    pressure: 'Commands, grouped options, generated help, and completion shortcuts are baseline user expectations.',
    cliCoreDecision: 'Expose command data, option scope, help, and completion candidates as machine-readable payloads rather than terminal text.',
    affectedSurface: Object.freeze(['describeCli', 'createCompletionPayload', 'completion bridge']),
    frontierAreas: Object.freeze(['completion-bridge', 'competitor-pressure']),
    assertions: Object.freeze(['scoped options complete in command context', 'manifest keeps global and local options separate'])
  }),
  Object.freeze({
    id: 'oclif-plugin-hooks',
    competitor: 'oclif',
    sourceUrl: 'https://oclif.io/docs/hooks/',
    pressure: 'Plugin hooks such as init, preparse, prerun, postrun, finally, and command_not_found are ecosystem-level extension points.',
    cliCoreDecision: 'Require manifest compatibility before runtime loading, preserve hook order, and surface hook effects and diagnostics in RunResult.',
    affectedSurface: Object.freeze(['plugins', 'runCli']),
    frontierAreas: Object.freeze(['plugin-command-application', 'plugin-lifecycle']),
    assertions: Object.freeze(['plugin command contributions apply before parse', 'hook effects enter RunResult'])
  }),
  Object.freeze({
    id: 'clipanion-state-machine',
    competitor: 'Clipanion',
    sourceUrl: 'https://mael.dev/clipanion/',
    pressure: 'Type-safe command definitions and state-machine command selection push APIs away from ambiguous stringly control flow.',
    cliCoreDecision: 'Keep immutable indexed programs and parsed invocations as replayable data that agents and tools can inspect.',
    affectedSurface: Object.freeze(['defineCli', 'parseCli', 'schemas']),
    frontierAreas: Object.freeze(['schema-artifacts', 'api-hardening']),
    assertions: Object.freeze(['nested command path matching is explicit', 'schema envelopes wrap parsed invocations'])
  }),
  Object.freeze({
    id: 'cac-default-variadic-nested-options',
    competitor: 'CAC',
    sourceUrl: 'https://raw.githubusercontent.com/cacjs/cac/master/README.md',
    pressure: 'Default command behavior, variadic arguments, command-specific options, and dot-nested options appear in small modern CLI frameworks.',
    cliCoreDecision: 'Use explicit command definitions and argv-flags delegation; pressure fixtures should separate supported behavior from non-goals.',
    affectedSurface: Object.freeze(['parseCli', 'repair', 'pressure fixtures']),
    frontierAreas: Object.freeze(['large-scale', 'competitor-pressure']),
    assertions: Object.freeze(['variadic positionals and dot-flag spellings are explicit', 'default command fallback is not implicit']),
    unsupportedCases: Object.freeze(['implicit default command routing', 'automatic dot-object expansion'])
  }),
  Object.freeze({
    id: 'cliffy-help-completion-env',
    competitor: 'Cliffy',
    sourceUrl: 'https://cliffy.io/docs/command/',
    pressure: 'Deno-first command frameworks combine type-safe options, generated help, completions, and environment-backed inputs.',
    cliCoreDecision: 'Keep config discovery host-driven, completion bridge-driven, and runtime consumption proven from the packed package.',
    affectedSurface: Object.freeze(['config discovery', 'completion bridge', 'runtime tests']),
    frontierAreas: Object.freeze(['completion-bridge', 'config-discovery', 'packed-consumer']),
    assertions: Object.freeze(['environment capture is explicit', 'help and completion remain structured data'])
  })
]);
