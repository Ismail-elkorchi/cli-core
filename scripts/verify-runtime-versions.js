import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const run = async () => {
  const versionsPath = path.join(process.cwd(), 'tools', 'runtime-versions.json');
  const versions = JSON.parse(await readFile(versionsPath, 'utf8'));
  const nodePolicy = versions.node;
  if (!nodePolicy || typeof nodePolicy.floor !== 'string') return;

  const result = spawnSync(process.execPath, ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`node version check failed: ${result.stderr || 'unknown error'}`);
  }

  const output = result.stdout || result.stderr || '';
  const version = parseNodeVersion(output);
  const minimum = parseSemver(nodePolicy.floor);
  if (!version || !minimum) {
    throw new Error(`node version output is invalid: ${output.trim() || 'unknown'}`);
  }
  if (compareSemver(version, minimum) < 0) {
    throw new Error(`node ${version.raw} does not satisfy floor ${nodePolicy.floor}`);
  }
};

function parseNodeVersion(output) {
  const trimmed = String(output).trim();
  const versionText = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
  return parseSemver(versionText);
}

function parseSemver(value) {
  const parts = String(value).trim().split('.');
  const majorText = parts[0] ?? '';
  const minorText = parts[1] ?? '0';
  const patchText = parts[2] ?? '0';
  if (!isDigits(majorText) || !isDigits(minorText) || !isDigits(patchText)) return null;
  return {
    major: Number(majorText),
    minor: Number(minorText),
    patch: Number(patchText),
    raw: `${majorText}.${minorText}.${patchText}`
  };
}

function compareSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function isDigits(value) {
  if (value.length === 0) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 48 || code > 57) return false;
  }
  return true;
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
