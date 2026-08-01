export {
  CliDefinitionError,
  defineCli,
  findCliCommand,
  findCliCommandByAlias,
  findCliCommandChildren
} from './command/index.ts';
export { completeCli } from './completion/index.ts';
export { createCliDiagnostic, hasErrorDiagnostics } from './diagnostics.ts';
export { CliHandlerNotFoundError, dispatchCli } from './dispatch/index.ts';
export { createCliHelp } from './help/index.ts';
export { createCliInvocationParser, findCliCommandForArgv } from './parse/index.ts';

export type {
  CliAlias,
  CliAliasDefinition,
  CliAliasInput,
  CliAliasMatch,
  CliCommand,
  CliCommandDefinition,
  CliDefinition,
  CliDefinitionIssue,
  CliOption,
  CliOptionDefinition,
  CliOptionValueMode,
  CliPositional,
  CliPositionalDefinition,
  CliProgram,
  CliSwitchOptionDefinition,
  CliValueOptionDefinition
} from './command/index.ts';
export type { CliCompletion, CliCompletionInput } from './completion/index.ts';
export type { CliCoreDiagnosticCode, CliDiagnostic, CliDiagnosticSeverity } from './diagnostics.ts';
export type { CliHandler, CliHandlerContext, CliHandlers } from './dispatch/index.ts';
export type {
  CliInvocationParser,
  CliOptionBinder,
  CliOptionBindingFailure,
  CliOptionBindingInput,
  CliOptionBindingResult,
  CliOptionBindingSuccess,
  CliUnknownFlag,
  ParsedAlias,
  ParsedInvocation,
  ParsedInvocationFailure,
  ParsedInvocationSuccess,
  ParseInput
} from './parse/index.ts';
export type { CliHelp, CliHelpCommand, CliHelpOption, CliHelpPositional } from './help/index.ts';
