export {
  CliDefinitionError,
  defineCli,
  findCliCommand,
  findCliCommandChildren
} from './command/index.ts';
export { completeCli } from './completion/index.ts';
export { createCliOptionDiagnostic, hasErrorDiagnostics } from './diagnostics.ts';
export { CliHandlerNotFoundError, dispatchCli } from './dispatch/index.ts';
export { createCliHelp } from './help/index.ts';
export { createCliInvocation, createCliInvocationParser } from './parse/index.ts';

export type {
  CliAlias,
  CliAliasDefinition,
  CliAliasInput,
  CliBooleanOptionDefinition,
  CliCommand,
  CliCommandDefinition,
  CliCountOptionDefinition,
  CliDefinition,
  CliDefinitionIssue,
  CliInvokableCommandKey,
  CliOption,
  CliOptionDefinition,
  CliOptionRepeat,
  CliOptionValueMode,
  CliPositional,
  CliPositionalDefinition,
  CliProgram,
  CliValueOptionDefinition
} from './command/index.ts';
export type { CliCompletion, CliCompletionInput } from './completion/index.ts';
export type {
  CliCoreDiagnostic,
  CliDiagnostic,
  CliDiagnosticSeverity,
  CliOptionDiagnostic
} from './diagnostics.ts';
export type { CliHandler, CliHandlerContext, CliHandlers } from './dispatch/index.ts';
export type {
  CliAliasUse,
  CliArgvParseInput,
  CliCommandRoute,
  CliCommandRouteFailure,
  CliCommandRouteSuccess,
  CliInvocation,
  CliInvocationFailure,
  CliInvocationParser,
  CliInvocationResult,
  CliInvocationSource,
  CliOptionBinder,
  CliOptionBindingFailure,
  CliOptionBindingInput,
  CliOptionBindingResult,
  CliOptionBindingSuccess,
  CliOptionScanFailure,
  CliOptionScanResult,
  CliOptionScanSuccess,
  CliScannedArgument,
  CliScannedOption,
  CliUnknownFlag,
  StructuredInvocationInput
} from './parse/index.ts';
export type {
  CliHelp,
  CliHelpAlias,
  CliHelpCommand,
  CliHelpOption,
  CliHelpPositional
} from './help/index.ts';
