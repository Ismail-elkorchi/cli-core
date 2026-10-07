import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const exec = promisify(execFile);
const repository = fileURLToPath(new URL('../..', import.meta.url));

test('an exact Git source dependency builds without checked-in dist', async (context) => {
  const workspace = await mkdtemp(join(tmpdir(), 'cli-core-git-'));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const source = join(workspace, 'source');
  const consumer = join(workspace, 'consumer');
  await mkdir(source); await mkdir(consumer);
  for (const path of ['src', 'scripts', 'package.json', 'package-lock.json', 'tsconfig.json', 'README.md', 'LICENSE', 'CHANGELOG.md']) {
    await cp(join(repository, path), join(source, path), { recursive: true });
  }
  await exec('git', ['init', '--quiet'], { cwd: source });
  await exec('git', ['add', '.'], { cwd: source });
  await exec('git', ['-c', 'user.name=Package Test', '-c', 'user.email=package-test@example.invalid', 'commit', '--quiet', '-m', 'Git package fixture'], { cwd: source });
  const { stdout: revision } = await exec('git', ['rev-parse', 'HEAD'], { cwd: source });
  await writeFile(join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  await exec(npm, ['install', '--offline', '--no-audit', '--no-fund', `git+${pathToFileURL(source).href}#${revision.trim()}`], { cwd: consumer });
  const { stdout } = await exec(process.execPath, ['--input-type=module', '--eval',
    "import { defineCli } from '@ismail-elkorchi/cli-core'; console.log(defineCli({name:'git-consumer'}).name);"], { cwd: consumer });
  assert.equal(stdout.trim(), 'git-consumer');
});
