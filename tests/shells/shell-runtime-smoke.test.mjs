import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { defineCli } from '../../dist/index.js';
import { createCompletionScript } from '../../dist/completion/index.js';

const execFileAsync = promisify(execFile);
const expectedShells = new Set(
  (process.env.CLI_CORE_EXPECT_SHELLS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);
const hasExplicitShellExpectation = expectedShells.size > 0;
const program = defineCli({
  name: 'ship',
  commands: [
    {
      name: 'deploy',
      options: [{ name: 'region', type: 'string', flags: ['--region'] }]
    }
  ]
});

test('bash completion script invokes the hidden completion protocol', async (context) => {
  await runShellSmoke(context, 'bash', async (workspace) => {
    const scriptPath = await writeCompletionScript(workspace, 'bash');
    const probePath = join(workspace, 'bash-probe.sh');
    const logPath = join(workspace, 'bash-argv.log');
    await writeFile(probePath, `
set -euo pipefail
LOG_PATH=${shellSingleQuote(logPath)}
ship() {
  printf '%s\\n' "$@" > "$LOG_PATH"
  printf '%s\\n' '--region'
}
. ${shellSingleQuote(scriptPath)}
COMP_WORDS=(ship deploy --r)
COMP_CWORD=2
_ship_completion
printf '%s\\n' "\${COMPREPLY[@]}"
`, 'utf8');

    const { stdout } = await execFileAsync('bash', [probePath]);
    assert.match(stdout, /--region/);
    const logged = await readShellLog(logPath);
    assert.equal(logged[0], '__complete');
    assert.deepEqual(logged.slice(1), ['ship', 'deploy', '--r']);
  });
});

test('zsh completion script can be loaded with completion initialized', async (context) => {
  await runShellSmoke(context, 'zsh', async (workspace) => {
    const scriptPath = await writeCompletionScript(workspace, 'zsh');
    const probePath = join(workspace, 'zsh-probe.zsh');
    await writeFile(probePath, `
emulate -L zsh
set -e
compdef() { :; }
compadd() { :; }
ship() {
  print -r -- "$@"
  print -r -- '--region'
}
. ${shellSingleQuote(scriptPath)}
print -r -- "loaded"
`, 'utf8');

    const { stdout } = await execFileAsync('zsh', ['-f', probePath]);
    assert.match(stdout, /loaded/);
  });
});

test('fish completion script invokes the hidden completion protocol', async (context) => {
  await runShellSmoke(context, 'fish', async (workspace) => {
    const scriptPath = await writeCompletionScript(workspace, 'fish');
    const probePath = join(workspace, 'fish-probe.fish');
    const logPath = join(workspace, 'fish-argv.log');
    await writeFile(probePath, `
set -gx LOG_PATH ${fishString(logPath)}
function ship
  printf '%s\\n' $argv > $LOG_PATH
  printf '%s\\n' --region
end
source ${fishString(scriptPath)}
complete -C "ship deploy --r"
`, 'utf8');

    const { stdout } = await execFileAsync('fish', [probePath]);
    assert.match(stdout, /--region/);
    const logged = await readShellLog(logPath);
    assert.equal(logged[0], '__complete');
  });
});

test('pwsh completion script invokes the hidden completion protocol', async (context) => {
  await runShellSmoke(context, 'pwsh', async (workspace) => {
    const scriptPath = await writeCompletionScript(workspace, 'pwsh');
    const probePath = join(workspace, 'pwsh-probe.ps1');
    await writeFile(probePath, `
$ErrorActionPreference = 'Stop'
$script:Seen = @()
function ship {
  $script:Seen = @($args)
  '--region'
}
. ${powerShellString(scriptPath)}
$result = TabExpansion2 -inputScript 'ship deploy --r' -cursorColumn 15
if ($script:Seen.Count -eq 0 -or $script:Seen[0] -ne '__complete') {
  throw 'completion protocol was not invoked'
}
$result.CompletionMatches | ForEach-Object { $_.CompletionText }
`, 'utf8');

    const { stdout } = await execFileAsync('pwsh', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      probePath
    ]);
    assert.match(stdout, /--region/);
  });
});

test('cmd can invoke a Node CLI adapter entrypoint explicitly', async (context) => {
  await runShellSmoke(context, 'cmd', async (workspace) => {
    const entrypoint = join(workspace, 'cmd-main.mjs');
    const wrapper = join(workspace, 'run.cmd');
    await writeFile(entrypoint, cmdEntrypointSource(), 'utf8');
    await writeFile(wrapper, `@echo off\r\n"${process.execPath}" "${entrypoint}" deploy api\r\n`, 'utf8');

    const { stdout, stderr } = await execFileAsync('cmd.exe', ['/d', '/c', wrapper]);
    assert.equal(stderr, '');
    assert.match(stdout, /command deploy/);
  });
});

async function runShellSmoke(context, shell, run) {
  if (hasExplicitShellExpectation && !expectedShells.has(shell)) {
    context.skip(`${shell} is not part of this CI shell target`);
    return;
  }

  if (!hasExplicitShellExpectation && !(await commandAvailable(commandForShell(shell)))) {
    context.skip(`${shell} is not available in this environment`);
    return;
  }
  assert.equal(await commandAvailable(commandForShell(shell)), true, `${shell} must be available`);

  const workspace = await mkdtemp(join(tmpdir(), `cli-core-${shell}-`));
  context.after(async () => {
    await rm(workspace, { recursive: true, force: true });
  });
  await run(workspace);
}

async function writeCompletionScript(workspace, shell) {
  const script = createCompletionScript(program, shell);
  const scriptPath = join(workspace, `ship-completion.${shellScriptExtension(shell)}`);
  await writeFile(scriptPath, script.script, 'utf8');
  return scriptPath;
}

async function readShellLog(path) {
  const { readFile } = await import('node:fs/promises');
  return (await readFile(path, 'utf8')).trim().split(/\r?\n/).filter(Boolean);
}

async function commandAvailable(command) {
  try {
    if (command === 'cmd.exe') {
      await execFileAsync(command, ['/d', '/c', 'ver']);
      return true;
    }
    await execFileAsync(command, ['--version']);
    return true;
  } catch {
    return false;
  }
}

function commandForShell(shell) {
  if (shell === 'cmd') return 'cmd.exe';
  return shell;
}

function shellScriptExtension(shell) {
  if (shell === 'pwsh') return 'ps1';
  if (shell === 'fish') return 'fish';
  if (shell === 'zsh') return 'zsh';
  return 'sh';
}

function shellSingleQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function fishString(value) {
  return `'${value.replaceAll("'", "\\'")}'`;
}

function powerShellString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function cmdEntrypointSource() {
  const rootImport = new URL('../../dist/index.js', import.meta.url).href;
  const adapterImport = new URL('../../dist/adapter/index.js', import.meta.url).href;
  return `
import { defineCli } from ${JSON.stringify(rootImport)};
import { createNodeCliAdapter, runCliMain } from ${JSON.stringify(adapterImport)};

const program = defineCli({
  name: 'ship',
  commands: [{ name: 'deploy', positionals: [{ name: 'service' }] }]
});

await runCliMain({
  program,
  mode: 'plan',
  handlers: { deploy: () => ({}) }
}, createNodeCliAdapter(process));
`;
}
