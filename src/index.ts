export { cliCorePackage } from './package.js';
export type { CliCorePackage } from './package.js';
export { defineCli, findCliCommand, findCliCommandByAlias } from './command/index.js';
export { createCompletionInstallPlan, createCompletionPayload, createCompletionScript } from './completion/index.js';
export { resolveCliConfig } from './config/index.js';
export { createHelpDocument, createVersionDocument } from './help/index.js';
export { describeCli } from './manifest/index.js';
export { parseCli, validateCli } from './parse/index.js';
export { checkCliPluginCompatibility, createCliPluginHost, defineCliPluginManifest } from './plugins/index.js';
export { suggestRepairs } from './repair/index.js';
export { runCli } from './run/index.js';
export type {
  CliAlias,
  CliAliasDefinition,
  CliAliasInput,
  CliCommand,
  CliCommandAliasIndexEntry,
  CliCommandDefinition,
  CliCommandPathIndexEntry,
  CliDefinition,
  CliOption,
  CliOptionDefinition,
  CliOptionType,
  CliOptionValue,
  CliPositional,
  CliPositionalDefinition,
  CliProgram
} from './command/index.js';
export type {
  CompletionInput,
  CompletionInstallPlan,
  CompletionInstallStep,
  CompletionItem,
  CompletionPayload,
  CompletionScript,
  CompletionShell
} from './completion/index.js';
export type {
  ParsedAlias,
  ParsedCliOptionValue,
  ParsedCliOptions,
  ParsedInvocation,
  ParsedPositionalValue,
  ParseInput,
  SemanticValidationResult,
  ValidationContext
} from './parse/index.js';
export type { RepairSuggestion } from './repair/index.js';
export type {
  ConfigDefinition,
  ConfigDiscoveryInput,
  ConfigDiscoveryResult,
  ConfigDiscoveryScope,
  ConfigExplanation,
  ConfigFieldDefinition,
  ConfigFileInput,
  ConfigInput,
  ConfigMigration,
  ConfigResolution,
  ConfigResolutionEntry,
  ConfigSource,
  ConfigValue,
  ConfigValueType
} from './config/index.js';
export type {
  CliDiagnostic,
  CliDiagnosticCode,
  CliDiagnosticSeverity,
  CliDiagnosticValue
} from './diagnostics.js';
export type {
  HelpCommandEntry,
  HelpDocument,
  HelpOptionEntry,
  HelpPositionalEntry,
  VersionDocument
} from './help/index.js';
export type {
  CommandManifest,
  ManifestAlias,
  ManifestCommand,
  ManifestOption,
  ManifestPositional,
  ManifestProgram
} from './manifest/index.js';
export type {
  CliPluginCompatibilityResult,
  CliPluginCoreCompatibility,
  CliPluginData,
  CliPluginEffect,
  CliPluginHookContext,
  CliPluginHookDefinition,
  CliPluginHookDefinitionInput,
  CliPluginHookEvent,
  CliPluginHookHandler,
  CliPluginHookOutput,
  CliPluginHookPlan,
  CliPluginHookReference,
  CliPluginHookResult,
  CliPluginHookRunInput,
  CliPluginHookRunResult,
  CliPluginHost,
  CliPluginHostInput,
  CliPluginLoadResult,
  CliPluginLoader,
  CliPluginManifest,
  CliPluginManifestDefinition,
  CliPluginModule,
  CliPluginRegistration,
  CliPluginRuntime
} from './plugins/index.js';
export type {
  CustomRunEffect,
  ExitKind,
  ExitStatusPolicy,
  FileRunEffect,
  RunArtifact,
  RunData,
  RunEffect,
  RunEvent,
  RunEventName,
  RunHandler,
  RunHandlerContext,
  RunHandlerOutput,
  RunIdentifier,
  RunMode,
  RunRequest,
  RunResult,
  SpawnRunEffect
} from './run/index.js';
