import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repository = fileURLToPath(new URL('../..', import.meta.url));
const tsc = join(repository, 'node_modules', 'typescript', 'bin', 'tsc');

for (const runtime of ['node', 'deno', 'bun']) {
  test(`packed package works in ${runtime}`, async (context) => {
    if (!(await commandAvailable(runtime))) {
      context.skip(`${runtime} is unavailable`);
      return;
    }
    const workspace = await mkdtemp(join(tmpdir(), `cli-core-${runtime}-`));
    context.after(() => rm(workspace, { recursive: true, force: true }));
    const packageArchive = await pack(workspace);
    await writeFile(join(workspace, 'package.json'), `${JSON.stringify({ private: true, type: 'module' })}\n`);
    await run('npm', [
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(workspace, packageArchive.filename)
    ], workspace);
    await writeFile(join(workspace, 'consumer.mjs'), consumerSource);
    if (runtime === 'node') {
      await writeFile(join(workspace, 'consumer.ts'), typeConsumerSource);
      await execFileAsync(process.execPath, [
        tsc,
        '--noEmit',
        '--strict',
        '--exactOptionalPropertyTypes',
        '--target',
        'ES2022',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        'consumer.ts'
      ], { cwd: workspace });
    }
    if (runtime === 'deno') {
      await writeFile(join(workspace, 'consumer.ts'), typeConsumerSource);
      await run('deno', [
        'check',
        '--deny-import',
        '--node-modules-dir=manual',
        'consumer.ts'
      ], workspace);
    }
    const args = runtime === 'deno' ? ['run', '--allow-read', 'consumer.mjs'] : ['consumer.mjs'];
    const { stdout } = await run(runtime, args, workspace);
    assert.deepEqual(JSON.parse(stdout), { commandKey: 'ship deploy', completion: 'deploy' });
  });
}

async function pack(destination) {
  const obsoleteOutput = join(repository, 'dist', 'obsolete', 'index.js');
  await mkdir(join(repository, 'dist', 'obsolete'), { recursive: true });
  await writeFile(obsoleteOutput, 'throw new Error("obsolete output was packaged");\n');
  const { stdout } = await run('npm', ['pack', '--json', '--pack-destination', destination], repository);
  const [archive] = JSON.parse(stdout);
  const paths = new Set(archive.files.map((file) => file.path));
  assert.equal(paths.has('dist/index.js'), true);
  assert.equal(paths.has('dist/obsolete/index.js'), false);
  assert.equal(paths.has('src/index.ts'), true);
  assert.equal([...paths].some((path) => path.startsWith('dist/config/')), false);
  assert.equal([...paths].some((path) => path.startsWith('dist/plugins/')), false);
  assert.equal([...paths].some((path) => path.startsWith('dist/schema/')), false);
  assert.equal([...paths].some((path) => path.includes('node_modules')), false);
  return archive;
}

async function commandAvailable(command) {
  try {
    await run(command, ['--version'], repository);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, cwd) {
  const executable = process.platform === 'win32'
    ? command === 'npm'
      ? 'npm.cmd'
      : `${command}.exe`
    : command;
  return execFileAsync(executable, args, { cwd });
}

const consumerSource = `
import { completeCli, defineCli, findCliCommand } from '@ismail-elkorchi/cli-core';
const program = defineCli({ name: 'ship', commands: [{ name: 'deploy' }] });
console.log(JSON.stringify({
  commandKey: findCliCommand(program, ['deploy'])?.key,
  completion: completeCli(program, { prefix: 'd' })[0]?.value
}));
`;

const typeConsumerSource = `
import { defineCli, type CliProgram } from '@ismail-elkorchi/cli-core';
const program: CliProgram = defineCli({ name: 'ship' });
void program;
`;
