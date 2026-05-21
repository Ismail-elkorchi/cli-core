import type { CliCommand, CliCommandSource, CliProgram } from '../command/index.js';
import { cliCorePackage } from '../package.js';

export { cliCorePackage };
export type { CliCorePackage } from '../package.js';

export type CompletionShell = 'bash' | 'zsh' | 'fish' | 'pwsh';

export interface CompletionInput {
  readonly commandPath?: readonly string[];
  readonly word?: string;
  readonly includeHidden?: boolean;
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
  const command = program.commands.find((candidate) => samePath(candidate.path, commandPath)) ?? program.root;
  const childCommands = program.commands.filter((candidate) => candidate.parentId === command.id);
  const includeHidden = input.includeHidden ?? false;
  const items = [
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
  const script = scriptFor(program.name, shell);
  return Object.freeze({
    schemaVersion: 'cli-core.completion-script.v1',
    shell,
    programName: program.name,
    script
  });
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

function scriptFor(programName: string, shell: CompletionShell): string {
  const shellName = shellWord(programName);
  const functionName = `${safeShellIdentifier(programName)}_completion`;
  if (shell === 'fish') return `complete -c ${shellName} -f -a "(${shellName} __complete)"\n`;
  if (shell === 'pwsh') return `Register-ArgumentCompleter -Native -CommandName ${powerShellString(programName)} -ScriptBlock { & ${powerShellString(programName)} __complete @args }\n`;
  if (shell === 'zsh') return `#compdef ${safePathSegment(programName)}\n_arguments '*: :(${shellName} __complete)'\n`;
  return `_${functionName}() { COMPREPLY=( $(${shellName} __complete "\${COMP_WORDS[@]}") ); }\ncomplete -F _${functionName} ${shellName}\n`;
}

function completionPath(programName: string, shell: CompletionShell): string {
  const pathName = safePathSegment(programName);
  if (shell === 'fish') return `~/.config/fish/completions/${pathName}.fish`;
  if (shell === 'pwsh') return `$HOME/.config/powershell/completions/${pathName}.ps1`;
  if (shell === 'zsh') return `~/.zsh/completions/_${pathName}`;
  return `~/.bash_completion.d/${pathName}`;
}

function completionDirectory(shell: CompletionShell): string {
  if (shell === 'fish') return '~/.config/fish/completions';
  if (shell === 'pwsh') return '$HOME/.config/powershell/completions';
  if (shell === 'zsh') return '~/.zsh/completions';
  return '~/.bash_completion.d';
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
      content: `fpath=(${completionDirectory(shell).replaceAll(' ', '\\ ')} $fpath)\nautoload -U compinit\ncompinit`,
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

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right.at(index));
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
