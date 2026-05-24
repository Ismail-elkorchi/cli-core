import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const defaultRoots = [
  'tests/core',
  'tests/contracts',
  'tests/security',
  'tests/examples'
];

const roots = resolveTestRoots();
const testFiles = (await collectTestFiles(roots)).sort();

if (testFiles.length === 0) {
  throw new Error(`No mutation test files found in: ${roots.join(', ')}`);
}

const child = spawn(process.execPath, ['--test', ...testFiles], {
  cwd: repoRoot,
  stdio: 'inherit'
});

const exitCode = await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('exit', (code, signal) => {
    if (signal) {
      reject(new Error(`Mutation test command terminated by ${signal}`));
      return;
    }
    resolve(code ?? 1);
  });
});

if (exitCode !== 0) {
  process.exitCode = exitCode;
}

async function collectTestFiles(rootsToCollect) {
  const files = [];
  for (const root of rootsToCollect) {
    files.push(...await collectFromDirectory(join(repoRoot, root)));
  }
  return files.map((file) => relative(repoRoot, file));
}

async function collectFromDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFromDirectory(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
      files.push(entryPath);
    }
  }

  return files;
}

function resolveTestRoots() {
  const envRoots = process.env.CLI_CORE_MUTATION_TEST_ROOTS?.split(',').map((root) => root.trim()).filter(Boolean);
  if (envRoots !== undefined && envRoots.length > 0) {
    return envRoots;
  }
  return process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultRoots;
}
