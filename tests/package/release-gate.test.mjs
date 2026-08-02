import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repository = fileURLToPath(new URL('../..', import.meta.url));
const releaseGate = fileURLToPath(new URL('../../scripts/release-gate.mjs', import.meta.url));
const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

test('an explicit release tag overrides a non-tag GitHub ref', async () => {
  const tag = `v${packageJson.version}`;
  const { stdout } = await execFileAsync(process.execPath, [releaseGate, tag], {
    cwd: repository,
    env: { ...process.env, GITHUB_REF_NAME: 'main' }
  });

  assert.equal(stdout, `release-gate: ok tag=${tag} version=${packageJson.version}\n`);
});
