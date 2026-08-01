import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('node CLI adapter runs from an outside entrypoint with OS-native argv and paths', async (context) => {
  const workspace = await mkdtemp(join(tmpdir(), 'cli-core-os-runtime-'));
  context.after(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  const targetDirectory = join(workspace, 'path with spaces');
  await mkdir(targetDirectory);
  const target = join(targetDirectory, 'deploy target.txt');
  const entrypoint = join(workspace, 'ship-main.mjs');
  await writeFile(entrypoint, osRuntimeEntrypointSource(), 'utf8');

  const success = await runProcess(process.execPath, [entrypoint, 'deploy', target]);
  assert.equal(success.status, 0);
  assert.equal(success.stderr, '');

  const payload = JSON.parse(success.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.commandPath, 'deploy');
  assert.equal(payload.target, target);
  assert.equal(payload.exitStatus, 0);

  const failure = await runProcess(process.execPath, [entrypoint, 'deply', target]);
  assert.equal(failure.status, 2);
  assert.equal(failure.stdout, '');
  assert.match(failure.stderr, /CLI_UNKNOWN_COMMAND/);
});

function osRuntimeEntrypointSource() {
  const rootUrl = new URL('../../dist/index.js', import.meta.url).href;
  const adapterUrl = new URL('../../dist/adapter/index.js', import.meta.url).href;
  const parserUrl = new URL('../support/invocation-parser.mjs', import.meta.url).href;
  return `
import { defineCli } from ${JSON.stringify(rootUrl)};
import { createNodeCliAdapter, runCliMain } from ${JSON.stringify(adapterUrl)};
import { testInvocationParser } from ${JSON.stringify(parserUrl)};

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
  parser: testInvocationParser,
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
        stdout: '',
        stderr: run.diagnostics.map((diagnostic) => diagnostic.code).join('\\n') + '\\n',
        exitStatus: run.exitStatus
      };
    }
    return {
      stdout: JSON.stringify({
        ok: run.ok,
        commandPath: run.invocation.commandPath.join(' '),
        target: run.invocation.positionals.target,
        exitStatus: run.exitStatus
      }) + '\\n',
      stderr: '',
      exitStatus: run.exitStatus
    };
  }
}, createNodeCliAdapter(process));
`;
}

function runProcess(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, (error, stdout, stderr) => {
      resolve({
        status: typeof error?.code === 'number' ? error.code : 0,
        stdout,
        stderr
      });
    });
  });
}
