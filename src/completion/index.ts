import {
  findCliCommand,
  findCliCommandChildren,
  type CliCommand,
  type CliCommandSource,
  type CliProgram
} from '../command/index.js';
import type { CliDiagnostic } from '../diagnostics.js';

export type CompletionShell = 'bash' | 'zsh' | 'fish' | 'pwsh';

export interface CompletionInput {
  readonly commandPath?: readonly string[];
  readonly word?: string;
  readonly includeHidden?: boolean;
}

export interface CompletionProtocolInput {
  readonly commandName?: string;
}

export interface CompletionCommandProtocol {
  readonly schemaVersion: 'cli-core.completion-protocol.v1';
  readonly commandName: string;
  readonly argvSeparator: '--';
  readonly request: {
    readonly words: 'argv';
    readonly currentWord: 'last_word';
    readonly cursor: 'word_index';
    readonly includeHidden: '--include-hidden';
  };
  readonly response: {
    readonly schemaVersion: 'cli-core.completion-response.v1';
    readonly items: 'payload.items';
    readonly value: 'item.value';
  };
}

export interface CompletionCommand {
  readonly schemaVersion: 'cli-core.completion-command.v1';
  readonly programName: string;
  readonly name: string;
  readonly hidden: true;
  readonly protocol: CompletionCommandProtocol;
}

export interface CompletionRequestInput {
  readonly words?: readonly string[];
  readonly currentWord?: string;
  readonly cursor?: number;
  readonly includeHidden?: boolean;
  readonly protocol?: CompletionProtocolInput;
}

export interface CompletionRequest {
  readonly schemaVersion: 'cli-core.completion-request.v1';
  readonly words: readonly string[];
  readonly currentWord: string;
  readonly cursor: number;
  readonly includeHidden: boolean;
  readonly protocol: CompletionCommandProtocol;
}

export interface CompletionResponse {
  readonly schemaVersion: 'cli-core.completion-response.v1';
  readonly request: CompletionRequest;
  readonly payload: CompletionPayload;
  readonly boundary: 'cli' | 'pass_through';
  readonly protocol: CompletionCommandProtocol;
  readonly diagnostics: readonly CliDiagnostic[];
}

export interface CompletionPayload {
  readonly schemaVersion: 'cli-core.completion.v1';
  readonly programName: string;
  readonly commandPath: readonly string[];
  readonly word: string;
  readonly items: readonly CompletionItem[];
}

export interface CompletionItem {
  readonly kind: 'command' | 'option' | 'alias' | 'positional';
  readonly value: string;
  readonly label: string;
  readonly description: string | undefined;
  readonly source?: CliCommandSource;
}

export interface CompletionScript {
  readonly schemaVersion: 'cli-core.completion-script.v1';
  readonly shell: CompletionShell;
  readonly programName: string;
  readonly protocol: CompletionCommandProtocol;
  readonly script: string;
}

export interface CompletionInstallPlan {
  readonly schemaVersion: 'cli-core.completion-install-plan.v1';
  readonly shell: CompletionShell;
  readonly programName: string;
  readonly steps: readonly CompletionInstallStep[];
}

export interface CompletionInstallStep {
  readonly action: 'write_file' | 'source_file' | 'add_to_profile';
  readonly path: string;
  readonly content: string | undefined;
  readonly description: string;
}

export function createCompletionPayload(program: CliProgram, input: CompletionInput = {}): CompletionPayload {
  const commandPath = input.commandPath ?? [];
  const word = input.word ?? '';
  const command = findCliCommand(program, commandPath) ?? program.root;
  const childCommands = findCliCommandChildren(program, command.id);
  const includeHidden = input.includeHidden ?? false;
  const items: CompletionItem[] = [
    ...childCommands.map(commandCompletion),
    ...childCommands.flatMap(childAliasCompletion),
    ...command.aliases.map((alias) => ({
      kind: 'alias' as const,
      value: alias.name,
      label: alias.name,
      description: alias.deprecated === undefined ? undefined : 'Deprecated alias.'
    })),
    ...[...command.inheritedOptions, ...command.options]
      .filter((option) => includeHidden || !option.hidden)
      .flatMap(optionCompletion),
    ...command.positionals.map((positional) => ({
      kind: 'positional' as const,
      value: positional.name,
      label: positional.required ? `<${positional.name}>` : `[${positional.name}]`,
      description: positional.description
    }))
  ].filter((item) => item.value.startsWith(word));

  return Object.freeze({
    schemaVersion: 'cli-core.completion.v1',
    programName: program.name,
    commandPath: Object.freeze([...command.path]),
    word,
    items: Object.freeze(items.map((item) => Object.freeze(item)))
  });
}

export function createCompletionScript(program: CliProgram, shell: CompletionShell): CompletionScript {
  const protocol = createCompletionProtocol();
  const script = scriptFor(program.name, shell, protocol.commandName);
  return Object.freeze({
    schemaVersion: 'cli-core.completion-script.v1',
    shell,
    programName: program.name,
    protocol,
    script
  });
}

export function createCompletionCommand(
  program: CliProgram,
  input: CompletionProtocolInput = {}
): CompletionCommand {
  const protocol = createCompletionProtocol(input.commandName);
  return Object.freeze({
    schemaVersion: 'cli-core.completion-command.v1' as const,
    programName: program.name,
    name: protocol.commandName,
    hidden: true as const,
    protocol
  });
}

export function createCompletionRequest(input: CompletionRequestInput | readonly string[] = {}): CompletionRequest {
  const requestInput: CompletionRequestInput = isCompletionWordArray(input) ? { words: input } : input;
  const words = Object.freeze([...(requestInput.words ?? [])]);
  const cursor = clampCursor(requestInput.cursor ?? words.length, words.length);
  const currentWord = requestInput.currentWord ?? (cursor > 0 ? words.at(cursor - 1) : undefined) ?? '';
  return Object.freeze({
    schemaVersion: 'cli-core.completion-request.v1' as const,
    words,
    currentWord,
    cursor,
    includeHidden: requestInput.includeHidden ?? false,
    protocol: createCompletionProtocol(requestInput.protocol?.commandName)
  });
}

export function completeCli(
  program: CliProgram,
  input: CompletionRequestInput | CompletionRequest | readonly string[] = {}
): CompletionResponse {
  const request = isCompletionRequest(input) ? input : createCompletionRequest(input);
  const normalized = normalizeCompletionWords(program, request);
  if (normalized.boundary === 'pass_through') {
    return completionResponse(request, normalized, []);
  }

  const context = resolveCompletionContext(program, normalized.committedWords);
  const items = completionBridgeItems(program, context.command, normalized.currentWord, normalized.includeHidden);
  return completionResponse(request, normalized, items);
}

export function createCompletionInstallPlan(program: CliProgram, shell: CompletionShell): CompletionInstallPlan {
  const script = createCompletionScript(program, shell);
  const path = completionPath(program.name, shell);
  const enableStep = completionEnableStep(program.name, shell, path);
  return Object.freeze({
    schemaVersion: 'cli-core.completion-install-plan.v1',
    shell,
    programName: program.name,
    steps: Object.freeze([
      Object.freeze({
        action: 'write_file' as const,
        path,
        content: script.script,
        description: `Write ${shell} completion script for ${program.name}.`
      }),
      Object.freeze(enableStep)
    ])
  });
}

function commandCompletion(command: CliCommand): CompletionItem {
  return {
    kind: 'command',
    value: command.name,
    label: command.name,
    description: command.description,
    source: command.source
  };
}

function childAliasCompletion(command: CliCommand): CompletionItem[] {
  return command.aliases.map((alias) => ({
    kind: 'alias',
    value: alias.name,
    label: alias.name,
    description: alias.deprecated === undefined
      ? `Alias for ${command.path.join(' ')}.`
      : `Deprecated alias for ${command.path.join(' ')}.`,
    source: command.source
  }));
}

function optionCompletion(option: CliCommand['options'][number]): CompletionItem[] {
  return option.flags.map((flag) => ({
    kind: 'option',
    value: flag,
    label: flag,
    description: option.description
  }));
}

function createCompletionProtocol(commandName = '__complete'): CompletionCommandProtocol {
  return Object.freeze({
    schemaVersion: 'cli-core.completion-protocol.v1' as const,
    commandName,
    argvSeparator: '--' as const,
    request: Object.freeze({
      words: 'argv' as const,
      currentWord: 'last_word' as const,
      cursor: 'word_index' as const,
      includeHidden: '--include-hidden' as const
    }),
    response: Object.freeze({
      schemaVersion: 'cli-core.completion-response.v1' as const,
      items: 'payload.items' as const,
      value: 'item.value' as const
    })
  });
}

function completionResponse(
  request: CompletionRequest,
  normalized: NormalizedCompletionWords,
  items: readonly CompletionItem[]
): CompletionResponse {
  return Object.freeze({
    schemaVersion: 'cli-core.completion-response.v1' as const,
    request,
    payload: Object.freeze({
      schemaVersion: 'cli-core.completion.v1' as const,
      programName: normalized.programName,
      commandPath: Object.freeze([...normalized.commandPath]),
      word: normalized.currentWord,
      items: Object.freeze(items.map((item) => Object.freeze(item)))
    }),
    boundary: normalized.boundary,
    protocol: request.protocol,
    diagnostics: Object.freeze([])
  });
}

interface NormalizedCompletionWords {
  readonly programName: string;
  readonly words: readonly string[];
  readonly committedWords: readonly string[];
  readonly currentWord: string;
  readonly commandPath: readonly string[];
  readonly includeHidden: boolean;
  readonly boundary: 'cli' | 'pass_through';
}

interface CompletionContext {
  readonly command: CliCommand;
}

function normalizeCompletionWords(program: CliProgram, request: CompletionRequest): NormalizedCompletionWords {
  const dropped = protocolPrefixLength(program, request);
  const words = Object.freeze(request.words.slice(dropped));
  const cursor = clampCursor(request.cursor - Math.min(request.cursor, dropped), words.length);
  const wordAtCursor = cursor > 0 ? words.at(cursor - 1) : undefined;
  const committedEnd = wordAtCursor === request.currentWord ? cursor - 1 : cursor;
  const committedWords = Object.freeze(words.slice(0, committedEnd));
  const boundaryIndex = words.indexOf(request.protocol.argvSeparator);
  const boundary = boundaryIndex >= 0 && committedEnd > boundaryIndex ? 'pass_through' : 'cli';
  const leadingWords = boundaryIndex >= 0
    ? committedWords.slice(0, Math.min(committedWords.length, boundaryIndex))
    : committedWords;
  const context = resolveCompletionContext(program, leadingWords);

  return Object.freeze({
    programName: program.name,
    words,
    committedWords: Object.freeze(leadingWords),
    currentWord: request.currentWord,
    commandPath: context.command.path,
    includeHidden: request.includeHidden,
    boundary
  });
}

function protocolPrefixLength(program: CliProgram, request: CompletionRequest): number {
  let dropped = 0;
  if (request.words.at(dropped) === program.name) dropped += 1;
  if (request.words.at(dropped) === request.protocol.commandName) dropped += 1;
  return dropped;
}

function resolveCompletionContext(program: CliProgram, words: readonly string[]): CompletionContext {
  let command = program.root;
  for (const token of words) {
    if (token.startsWith('-')) break;
    const next = findChildCommand(program, command, token);
    if (next === undefined) break;
    command = next;
  }
  return Object.freeze({ command });
}

function findChildCommand(program: CliProgram, command: CliCommand, token: string): CliCommand | undefined {
  const children = findCliCommandChildren(program, command.id);
  return children.find((candidate) => candidate.name === token || candidate.aliases.some((alias) => alias.name === token));
}

function completionBridgeItems(
  program: CliProgram,
  command: CliCommand,
  word: string,
  includeHidden: boolean
): readonly CompletionItem[] {
  if (word.startsWith('-')) {
    return scopedOptionItems(command, word, includeHidden);
  }
  return Object.freeze([
    ...childCommandItems(program, command, word),
    ...positionalItems(command, word)
  ]);
}

function childCommandItems(program: CliProgram, command: CliCommand, word: string): readonly CompletionItem[] {
  const children = findCliCommandChildren(program, command.id);
  return Object.freeze([
    ...children.map(commandCompletion),
    ...children.flatMap(childAliasCompletion)
  ].filter((item) => item.value.startsWith(word)));
}

function positionalItems(command: CliCommand, word: string): readonly CompletionItem[] {
  return Object.freeze(command.positionals
    .map((positional) => ({
      kind: 'positional' as const,
      value: positional.name,
      label: positional.required ? `<${positional.name}>` : `[${positional.name}]`,
      description: positional.description
    }))
    .filter((item) => item.value.startsWith(word)));
}

function scopedOptionItems(command: CliCommand, word: string, includeHidden: boolean): readonly CompletionItem[] {
  return Object.freeze([...command.inheritedOptions, ...command.options]
    .filter((option) => includeHidden || !option.hidden)
    .flatMap(optionCompletion)
    .filter((item) => item.value.startsWith(word)));
}

function scriptFor(programName: string, shell: CompletionShell, commandName: string): string {
  const shellName = shellWord(programName);
  const trigger = shellWord(commandName);
  const functionName = `${safeShellIdentifier(programName)}_completion`;
  if (shell === 'fish') return `complete -c ${shellName} -f -a "(${shellName} ${trigger} (commandline -opc))"\n`;
  if (shell === 'pwsh') return `Register-ArgumentCompleter -Native -CommandName ${powerShellString(programName)} -ScriptBlock { & ${powerShellString(programName)} ${powerShellString(commandName)} @args }\n`;
  if (shell === 'zsh') {
    return `#compdef ${safePathSegment(programName)}
_${functionName}() {
  local completions
  completions="$(${shellName} ${trigger} "$words[@]")"
  local -a candidates
  candidates=("\${(@f)completions}")
  compadd -- "\${candidates[@]}"
}
compdef _${functionName} ${shellName}
`;
  }
  return `_${functionName}() { COMPREPLY=( $(${shellName} ${trigger} "\${COMP_WORDS[@]}") ); }\ncomplete -F _${functionName} ${shellName}\n`;
}

function completionPath(programName: string, shell: CompletionShell): string {
  const pathName = safePathSegment(programName);
  if (shell === 'fish') return `~/.config/fish/completions/${pathName}.fish`;
  if (shell === 'pwsh') return `$HOME/.config/powershell/completions/${pathName}.ps1`;
  if (shell === 'zsh') return `~/.zsh/completions/_${pathName}`;
  return `~/.bash_completion.d/${pathName}`;
}

function completionEnableStep(programName: string, shell: CompletionShell, scriptPath: string): CompletionInstallStep {
  if (shell === 'fish') {
    return {
      action: 'source_file',
      path: scriptPath,
      content: undefined,
      description: `Source fish completion script for ${programName} in the current shell.`
    };
  }
  if (shell === 'pwsh') {
    return {
      action: 'add_to_profile',
      path: '$PROFILE',
      content: `. "${scriptPath}"`,
      description: `Enable pwsh completion for ${programName}.`
    };
  }
  if (shell === 'zsh') {
    return {
      action: 'add_to_profile',
      path: '~/.zshrc',
      content: 'fpath=(~/.zsh/completions $fpath)\nautoload -U compinit\ncompinit',
      description: `Enable zsh completion for ${programName}.`
    };
  }
  return {
    action: 'add_to_profile',
    path: '~/.bashrc',
    content: `source ${scriptPath.replaceAll(' ', '\\ ')}`,
    description: `Enable bash completion for ${programName}.`
  };
}

function isCompletionRequest(input: CompletionRequestInput | CompletionRequest | readonly string[]): input is CompletionRequest {
  return !Array.isArray(input) && 'schemaVersion' in input && input.schemaVersion === 'cli-core.completion-request.v1';
}

function isCompletionWordArray(input: CompletionRequestInput | readonly string[]): input is readonly string[] {
  return Array.isArray(input);
}

function clampCursor(cursor: number, wordCount: number): number {
  if (!Number.isFinite(cursor)) return wordCount;
  if (cursor < 0) return 0;
  if (cursor > wordCount) return wordCount;
  return Math.trunc(cursor);
}

function shellWord(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function powerShellString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function safeShellIdentifier(value: string): string {
  const safe = value.replaceAll(/[^A-Za-z0-9_]/g, '_');
  return safe.length === 0 ? 'cli' : safe;
}

function safePathSegment(value: string): string {
  const safe = value.replaceAll(/[^A-Za-z0-9._-]/g, '_');
  return safe.length === 0 ? 'cli' : safe;
}
