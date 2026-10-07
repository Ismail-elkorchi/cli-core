import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

async function createFixture(t, version = '0.4.0', heading = `## ${version} - Unreleased`) {
  const directory = await mkdtemp(join(tmpdir(), 'cli-core-release-gate-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifests = {
    'package.json': { version },
    'package-lock.json': { version, packages: { '': { version } } },
    'jsr.json': { version }
  };
  await Promise.all([
    ...Object.entries(manifests).map(([name, manifest]) =>
      writeFile(join(directory, name), `${JSON.stringify(manifest)}\n`)),
    writeFile(join(directory, 'CHANGELOG.md'), `# Changelog\n\n${heading}\n`)
  ]);
  return { directory, manifests };
}

function runGate(directory, tag = 'v0.4.0') {
  return execFileAsync(process.execPath, [releaseGate, tag], {
    cwd: directory,
    env: { ...process.env, GITHUB_REF_NAME: 'main' }
  });
}

for (const { name, label, root } of [
  { name: 'package.json', label: 'package.json version' },
  { name: 'package-lock.json', label: 'package-lock.json version' },
  { name: 'package-lock.json', label: 'package-lock.json packages[""] version', root: true },
  { name: 'jsr.json', label: 'jsr.json version' }
]) {
  for (const staleVersion of ['0.3.0', undefined]) {
    test(`rejects ${staleVersion === undefined ? 'missing' : 'stale'} ${label}`, async (t) => {
      const { directory, manifests } = await createFixture(t);
      const manifest = manifests[name];
      (root ? manifest.packages[''] : manifest).version = staleVersion;
      await writeFile(join(directory, name), JSON.stringify(manifest));
      await assert.rejects(runGate(directory), (error) => {
        assert.ok(error.stderr.includes(`release-gate: ${label} mismatch`), error.stderr);
        return true;
      });
    });
  }
}

for (const heading of [
  '## 0.4.0',
  '## 0.4.0 - Unreleased',
  '### v0.4.0 - 2026-10-07',
  '## 0.4.0(Unreleased)',
  '## 0.4.0 - Unreleased\r'
]) {
  test(`accepts exact stable version heading ${JSON.stringify(heading)}`, async (t) => {
    const { directory } = await createFixture(t, '0.4.0', heading);
    const { stdout } = await runGate(directory);
    assert.equal(stdout, 'release-gate: ok tag=v0.4.0 version=0.4.0\n');
  });
}

for (const heading of [
  '## 0.4.0-rc.1 - Unreleased',
  '### v0.4.0-rc.1',
  '## 0.4.0+build.1',
  '## 0.4.00 - Unreleased',
  '## 0.3.0 - Unreleased',
  '# 0.4.0 - Unreleased',
  '- 0.4.0'
]) {
  test(`rejects nonmatching stable version heading ${JSON.stringify(heading)}`, async (t) => {
    const { directory } = await createFixture(t, '0.4.0', heading);
    await assert.rejects(runGate(directory), /missing CHANGELOG section for version 0\.4\.0/u);
  });
}

for (const version of ['0.4.0-rc.1', '0.4.0-rc.1+build.2']) {
  test(`accepts exact prerelease ${version} with a normalized tag ref`, async (t) => {
    const { directory } = await createFixture(t, version, `### v${version} - Unreleased`);
    const { stdout } = await runGate(directory, `refs/tags/v${version}`);
    assert.equal(stdout, `release-gate: ok tag=v${version} version=${version}\n`);
  });
}

for (const heading of ['## 0.4.0', '## 0.4.0-rc.10', '## 0.4.0-rc.1-extra']) {
  test(`rejects nonmatching prerelease heading ${heading}`, async (t) => {
    const { directory } = await createFixture(t, '0.4.0-rc.1', heading);
    await assert.rejects(runGate(directory, 'v0.4.0-rc.1'), /missing CHANGELOG section/u);
  });
}

test('requires a v-prefixed tag', async (t) => {
  const { directory } = await createFixture(t);
  await assert.rejects(runGate(directory, '0.4.0'), /expected v-prefixed tag/u);
});
