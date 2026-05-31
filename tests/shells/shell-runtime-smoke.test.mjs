import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

test('bash can invoke a Node CLI adapter entrypoint with OS-native parsing', async (context) => {
  await runShellSmoke(context, 'bash', async (workspace) => {
    const result = await runShellEntrypoint(context, workspace, 'bash', ['deploy', 'api']);
    assert.equal(result.status, 0);
    assert.equal(result.payload.ok, true);
    assert.equal(result.payload.commandPath, 'deploy');
    assert.equal(result.payload.target, 'api');
    assert.equal(result.payload.exitStatus, 0);
  });
});

test('zsh can invoke a Node CLI adapter entrypoint with OS-native parsing', async (context) => {
  await runShellSmoke(context, 'zsh', async (workspace) => {
    const result = await runShellEntrypoint(context, workspace, 'zsh', ['deploy', 'api']);
    assert.equal(result.status, 0);
    assert.equal(result.payload.ok, true);
    assert.equal(result.payload.commandPath, 'deploy');
    assert.equal(result.payload.target, 'api');
    assert.equal(result.payload.exitStatus, 0);
  });
});

test('fish can invoke a Node CLI adapter entrypoint with OS-native parsing', async (context) => {
  await runShellSmoke(context, 'fish', async (workspace) => {
    const result = await runShellEntrypoint(context, workspace, 'fish', ['deploy', 'api']);
    assert.equal(result.status, 0);
    assert.equal(result.payload.ok, true);
    assert.equal(result.payload.commandPath, 'deploy');
    assert.equal(result.payload.target, 'api');
    assert.equal(result.payload.exitStatus, 0);
  });
});

test('pwsh can invoke a Node CLI adapter entrypoint with OS-native parsing', async (context) => {
  await runShellSmoke(context, 'pwsh', async (workspace) => {
    const result = await runShellEntrypoint(context, workspace, 'pwsh', ['deploy', 'api']);
    assert.equal(result.status, 0);
    assert.equal(result.payload.ok, true);
    assert.equal(result.payload.commandPath, 'deploy');
    assert.equal(result.payload.target, 'api');
    assert.equal(result.payload.exitStatus, 0);
  });
});

test('shell entrypoint failure is translated into non-zero exit status', async (context) => {
  await runShellSmoke(context, 'bash', async (workspace) => {
    const result = await runShellEntrypoint(context, workspace, 'bash', ['deply', 'api']);
    assert.equal(result.status, 2);
    assert.equal(result.payload.ok, false);
    assert.equal(result.payload.exitStatus, 2);
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
    const payload = parseJsonPayload(stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.commandPath, 'deploy');
    assert.equal(payload.target, 'api');
    assert.equal(payload.exitStatus, 0);
  });
});

test('cmd handles nested command and long options with spaces', async (context) => {
  await runShellSmoke(context, 'cmd', async (workspace) => {
    const result = await runShellEntrypoint(
      context,
      workspace,
      'cmd',
      [
        'config',
        'set',
        '--config-file=C:\\Program Files\\ship\\config profile.json',
        '--dry-run',
        '--message=Alpha\'s value',
        'release',
        'output with spaces'
      ],
      shellNestedEntrypointSource()
    );

    assert.equal(result.status, 0);
    assert.equal(result.payload.ok, true);
    assert.equal(result.payload.commandPath, 'config set');
    assert.equal(result.payload.configFile, 'C:\\Program Files\\ship\\config profile.json');
    assert.equal(result.payload.dryRun, true);
    assert.equal(result.payload.message, "Alpha's value");
    assert.equal(result.payload.key, 'release');
    assert.equal(result.payload.value, 'output with spaces');
  });
});

test('cmd handles mixed quoting for nested long options', async (context) => {
  if (process.platform !== 'win32') {
    context.skip('Windows shell quoting edge cases are validated on Windows runtime shells');
  }

  await runShellSmoke(context, 'cmd', async (workspace) => {
    const result = await runShellEntrypointCommandLine(
      context,
      workspace,
      'cmd',
      ({ binary, entrypoint }) =>
        `"${binary}" "${entrypoint}" config set --config-file="C:\\Program Files\\ship\\config profile.json" --message="A 'mixed' value" --dry-run release "output with spaces"`,
      shellNestedEntrypointSource()
    );

    assert.equal(result.status, 0);
    assert.equal(result.payload.ok, true);
    assert.equal(result.payload.commandPath, 'config set');
    assert.equal(result.payload.configFile, 'C:\\Program Files\\ship\\config profile.json');
    assert.equal(result.payload.dryRun, true);
    assert.equal(result.payload.message, "A 'mixed' value");
    assert.equal(result.payload.key, 'release');
    assert.equal(result.payload.value, 'output with spaces');
  });
});

test('pwsh handles nested command and long options with mixed quoting', async (context) => {
  if (process.platform !== 'win32') {
    context.skip('Windows command/argv parsing edge case is validated on Windows runtime shells');
  }

  await runShellSmoke(context, 'pwsh', async (workspace) => {
    const result = await runShellEntrypoint(
      context,
      workspace,
      'pwsh',
      [
        'config',
        'set',
        '--message',
        'A value with mixed quoting',
        '--config-file=C:\\Program Files\\ship\\config profile.json',
        '--dry-run',
        'release',
        'value with spaces'
      ],
      shellNestedEntrypointSource()
    );

    assert.equal(result.status, 0);
    assert.equal(result.payload.ok, true);
    assert.equal(result.payload.commandPath, 'config set');
    assert.equal(result.payload.configFile, 'C:\\Program Files\\ship\\config profile.json');
    assert.equal(result.payload.dryRun, true);
    assert.equal(result.payload.message, 'A value with mixed quoting');
    assert.equal(result.payload.key, 'release');
    assert.equal(result.payload.value, 'value with spaces');
  });
});

test('pwsh handles mixed quoting forms for nested command parsing', async (context) => {
  if (process.platform !== 'win32') {
    context.skip('Windows shell quoting edge cases are validated on Windows runtime shells');
  }

  await runShellSmoke(context, 'pwsh', async (workspace) => {
    const result = await runShellEntrypointCommandLine(
      context,
      workspace,
      'pwsh',
      ({ binary, entrypoint }) =>
        `& ${powerShellString(binary)} ${powerShellString(entrypoint)} config set --config-file "C:\\Program Files\\ship\\config profile.json" --message 'A ''double''-style value' --dry-run release 'output with spaces'`,
      shellNestedEntrypointSource()
    );

    assert.equal(result.status, 0);
    assert.equal(result.payload.ok, true);
    assert.equal(result.payload.commandPath, 'config set');
    assert.equal(result.payload.configFile, 'C:\\Program Files\\ship\\config profile.json');
    assert.equal(result.payload.dryRun, true);
    assert.equal(result.payload.message, "A 'double'-style value");
    assert.equal(result.payload.key, 'release');
    assert.equal(result.payload.value, 'output with spaces');
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

async function runShellEntrypoint(context, workspace, shell, args, entrypointSource = shellEntrypointSource()) {
  return runShellEntrypointCommandLine(
    context,
    workspace,
    shell,
    ({ binary, entrypoint }) =>
      shellInvocationLine(
        shell,
        binary,
        entrypoint,
        args
      ),
    entrypointSource
  );
}

async function runShellEntrypointCommandLine(
  context,
  workspace,
  shell,
  commandLineFactory,
  entrypointSource = shellEntrypointSource()
) {
  const entrypoint = await writeShellEntrypoint(workspace, entrypointSource);
  const commandLine = commandLineFactory({
    binary: process.execPath,
    entrypoint
  });
  const command = commandForShell(shell);
  let commandArgs;

  if (shell === 'cmd') {
    const commandFile = join(workspace, 'run-shell-command.cmd');
    await writeFile(commandFile, cmdInvocationScript(commandLine), 'utf8');
    commandArgs = ['/d', '/c', commandFile];
  } else if (shell === 'pwsh') {
    const commandFile = join(workspace, 'run-shell-command.ps1');
    await writeFile(commandFile, pwshInvocationScript(commandLine), 'utf8');
    commandArgs = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      commandFile
    ];
  } else {
    commandArgs = shellCommandArgs(shell, commandLine);
  }

  try {
    const { stdout, stderr } = await execFileAsync(command, commandArgs);
    assert.equal(stderr, '');
    return {
      status: 0,
      payload: parseJsonPayload(stdout),
      stderr: stderr
    };
  } catch (error) {
    context.diagnostic(`shell entrypoint failed for ${shell}: ${String(error.message ?? error)}`);
    return {
      status: typeof error.code === 'number' ? error.code : 1,
      payload: parseJsonPayload(error.stdout ?? ''),
      stderr: error.stderr ?? ''
    };
  }
}

function cmdInvocationScript(commandLine) {
  return `@echo off\r\n${commandLine}\r\n`;
}

function pwshInvocationScript(commandLine) {
  return `$ErrorActionPreference = 'Stop'\n${commandLine}\n`;
}

async function writeCompletionScript(workspace, shell) {
  const script = createCompletionScript(program, shell);
  const scriptPath = join(workspace, `ship-completion.${shellScriptExtension(shell)}`);
  await writeFile(scriptPath, script.script, 'utf8');
  return scriptPath;
}

async function writeShellEntrypoint(workspace, entrypointSource) {
  const entryWorkspace = join(workspace, 'entrypoint with spaces');
  await mkdir(entryWorkspace, { recursive: true });
  const entrypoint = join(entryWorkspace, 'ship main.mjs');
  await writeFile(entrypoint, entrypointSource, 'utf8');
  return entrypoint;
}

async function readShellLog(path) {
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

function parseJsonPayload(rawOutput) {
  return JSON.parse(rawOutput.toString().trim() || '{}');
}

function shellInvocationLine(shell, nodeBinary, entrypoint, args) {
  const quotedBinary = shellAwareQuote(shell, nodeBinary);
  const quotedEntrypoint = shellAwareQuote(shell, entrypoint);
  const quotedArgs = args.map((arg) => shellAwareQuote(shell, arg)).join(' ');
  const commandLine = `${quotedBinary} ${quotedEntrypoint} ${quotedArgs}`.trim();

  if (shell === 'pwsh') {
    return `& ${commandLine}`;
  }
  return commandLine;
}

function shellCommandArgs(shell, commandLine) {
  if (shell === 'cmd') return ['/d', '/c', commandLine];
  if (shell === 'pwsh') {
    return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', commandLine];
  }
  if (shell === 'zsh') {
    return ['-fc', commandLine];
  }
  return ['-c', commandLine];
}

function shellAwareQuote(shell, value) {
  if (shell === 'cmd') {
    return `"${value}"`;
  }
  if (shell === 'pwsh') {
    return powerShellString(value);
  }
  if (shell === 'fish') {
    return fishString(value);
  }
  return shellSingleQuote(value);
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
  mode: 'apply',
  handlers: {
    deploy: ({ invocation }) => ({
      artifacts: [
        {
          id: 'deploy',
          kind: 'json',
          payload: {
            target: invocation.positionals.service
          }
        }
      ]
    })
  },
  render: (run) => {
    if (!run.ok) {
      return {
        stdout: JSON.stringify({
          ok: run.ok,
          commandPath: run.invocation.commandPath.join(' '),
          target: run.invocation.positionals.service ?? null,
          diagnostics: run.diagnostics.map((diagnostic) => diagnostic.code),
          exitStatus: run.exitStatus
        }),
        stderr: '',
        exitStatus: run.exitStatus
      };
    }
    return {
      stdout: JSON.stringify({
        ok: run.ok,
        commandPath: run.invocation.commandPath.join(' '),
        target: run.invocation.positionals.service,
        exitStatus: run.exitStatus
      }),
      stderr: '',
      exitStatus: run.exitStatus
    };
  }
}, createNodeCliAdapter(process));
`;
}

function shellEntrypointSource() {
  const rootUrl = new URL('../../dist/index.js', import.meta.url).href;
  const adapterUrl = new URL('../../dist/adapter/index.js', import.meta.url).href;
  return `
import { defineCli } from ${JSON.stringify(rootUrl)};
import { createNodeCliAdapter, runCliMain } from ${JSON.stringify(adapterUrl)};

const program = defineCli({
  name: 'ship',
  commands: [
    {
      name: 'deploy',
      positionals: [{ name: 'target' }]
    }
  ]
});

await runCliMain({
  program,
  mode: 'apply',
  handlers: {
    deploy: ({ invocation }) => ({
      artifacts: [
        {
          id: 'target',
          kind: 'json',
          payload: {
            target: invocation.positionals.target
          }
        }
      ]
    })
  },
  render: (run) => {
    if (!run.ok) {
      return {
        stdout: JSON.stringify({
          ok: run.ok,
          commandPath: run.invocation.commandPath.join(' '),
          target: run.invocation.positionals.target ?? null,
          diagnostics: run.diagnostics.map((diagnostic) => diagnostic.code),
          exitStatus: run.exitStatus
        }),
        stderr: '',
        exitStatus: run.exitStatus
      };
    }
    return {
      stdout: JSON.stringify({
        ok: run.ok,
        commandPath: run.invocation.commandPath.join(' '),
        target: run.invocation.positionals.target,
        exitStatus: run.exitStatus
      }),
      stderr: '',
      exitStatus: run.exitStatus
    };
  }
}, createNodeCliAdapter(process));
`;
}

function shellNestedEntrypointSource() {
  const rootUrl = new URL('../../dist/index.js', import.meta.url).href;
  const adapterUrl = new URL('../../dist/adapter/index.js', import.meta.url).href;
  return `
import { defineCli } from ${JSON.stringify(rootUrl)};
import { createNodeCliAdapter, runCliMain } from ${JSON.stringify(adapterUrl)};

const program = defineCli({
  name: 'ship',
  commands: [
    {
      name: 'config',
      commands: [
        {
          name: 'set',
          options: [
            {
              name: 'config-file',
              type: 'string',
              flags: ['--config-file']
            },
            {
              name: 'message',
              type: 'string',
              flags: ['--message']
            },
            {
              name: 'dry-run',
              type: 'boolean',
              flags: ['--dry-run']
            }
          ],
          positionals: [
            { name: 'key' },
            { name: 'value' }
          ]
        }
      ]
    }
  ]
});

await runCliMain({
  program,
  mode: 'apply',
  handlers: {
    'config set': ({ invocation }) => ({
      artifacts: [
        {
          id: 'config-set',
          kind: 'json',
          payload: {
            commandPath: invocation.commandPath.join(' '),
            configFile: invocation.options.values['config-file'],
            message: invocation.options.values.message,
            dryRun: invocation.options.values['dry-run'],
            key: invocation.positionals.key,
            value: invocation.positionals.value
          }
        }
      ]
    })
  },
  render: (run) => {
    if (!run.ok) {
      return {
        stdout: JSON.stringify({
          ok: run.ok,
          commandPath: run.invocation.commandPath.join(' '),
          configFile: run.invocation.options.values['config-file'],
          message: run.invocation.options.values.message,
          dryRun: run.invocation.options.values['dry-run'],
          key: run.invocation.positionals.key ?? null,
          value: run.invocation.positionals.value ?? null,
          exitStatus: run.exitStatus
        }),
        stderr: '',
        exitStatus: run.exitStatus
      };
    }
    return {
      stdout: JSON.stringify({
        ok: run.ok,
        commandPath: run.invocation.commandPath.join(' '),
        configFile: run.invocation.options.values['config-file'],
        message: run.invocation.options.values.message,
        dryRun: run.invocation.options.values['dry-run'],
        key: run.invocation.positionals.key,
        value: run.invocation.positionals.value,
        exitStatus: run.exitStatus
      }),
      stderr: '',
      exitStatus: run.exitStatus
    };
  }
}, createNodeCliAdapter(process));
`;
}
