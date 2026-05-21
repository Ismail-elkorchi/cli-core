export { cliCorePackage } from './package.js';
export type { CliCorePackage } from './package.js';
export { defineCli, findCliCommand, findCliCommandByAlias } from './command/index.js';
export { createCompletionInstallPlan, createCompletionPayload, createCompletionScript } from './completion/index.js';
export { resolveCliConfig } from './config/index.js';
export { applyCliEffects, createMemoryEffectHost, planCliEffects } from './effects/index.js';
export { createHelpDocument, createVersionDocument } from './help/index.js';
export { describeCli } from './manifest/index.js';
export { parseCli, validateCli } from './parse/index.js';
export {
  applyCliPluginCommands,
  checkCliPluginCompatibility,
  createCliPluginHost,
  defineCliPluginManifest
} from './plugins/index.js';
export { suggestRepairs } from './repair/index.js';
export { runCli } from './run/index.js';
export {
  createCliFailureEnvelope,
  createCliSchemaEnvelope,
  createUnsupportedSchemaDiagnostic,
  describeCliSchemas,
  exitKindToFailureKind,
  failureKindForDiagnostics,
  isCliSchemaVersion,
  redactCliDiagnostic,
  redactCliDiagnostics,
  redactCliSecrets,
  redactCliSecretsWithReport
} from './schema/index.js';
export type {
  CliAlias,
  CliAliasDefinition,
  CliAliasInput,
  CliCommand,
  CliCommandAliasIndexEntry,
  CliCommandDefinition,
  CliCommandPathIndexEntry,
  CliCommandSource,
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
  CliEffectHost,
  EffectApplicationItemReport,
  EffectApplicationMode,
  EffectApplicationPolicy,
  EffectApplicationReport,
  EffectApplicationRequest,
  EffectHostResult,
  MemoryEffectHost,
  MemorySpawnRecord
} from './effects/index.js';
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
  ManifestCommandSource,
  ManifestOption,
  ManifestPositional,
  ManifestProgram
} from './manifest/index.js';
export type {
  CliPluginCompatibilityResult,
  CliPluginCommandApplication,
  CliPluginCommandApplicationInput,
  CliPluginCommandContribution,
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
  PluginRunEffect,
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
export type {
  CliFailureEnvelope,
  CliFailureEnvelopeInput,
  CliFailureKind,
  CliRedactionMatch,
  CliRedactionOptions,
  CliRedactionReason,
  CliRedactionResult,
  CliSchemaDescriptor,
  CliSchemaEnvelope,
  CliSchemaEnvelopeInput,
  CliSchemaName,
  CliSchemaVersion
} from './schema/index.js';
