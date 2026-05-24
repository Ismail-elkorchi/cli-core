import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const strykerBin = join(repoRoot, 'node_modules', '@stryker-mutator', 'core', 'bin', 'stryker.js');
const defaultTestRoots = ['tests/core', 'tests/contracts', 'tests/security', 'tests/examples'];
const integrationTestRoots = [...defaultTestRoots, 'tests/integration'];
const securityTestRoots = [...defaultTestRoots, 'tests/integration', 'tests/security'];

const sourceAreas = new Map([
  ['adapter', {
    mutate: ['src/adapter/index.ts'],
    tests: [...securityTestRoots, 'tests/runtime-os']
  }],
  ['command', {
    mutate: ['src/command/index.ts'],
    tests: [...defaultTestRoots, 'tests/integration']
  }],
  ['completion', {
    mutate: ['src/completion/index.ts'],
    tests: [...integrationTestRoots, 'tests/shells']
  }],
  ['config', {
    mutate: [
      'src/config/discovery.ts',
      'src/config/index.ts',
      'src/config/memory-host.ts',
      'src/config/migration.ts',
      'src/config/path.ts',
      'src/config/resolve.ts',
      'src/config/types.ts'
    ],
    tests: securityTestRoots
  }],
  ['diagnostics', {
    mutate: ['src/diagnostics.ts'],
    tests: integrationTestRoots
  }],
  ['effects', {
    mutate: ['src/effects/index.ts'],
    tests: securityTestRoots
  }],
  ['help', {
    mutate: ['src/help/index.ts'],
    tests: defaultTestRoots
  }],
  ['manifest', {
    mutate: ['src/manifest/index.ts'],
    tests: [...defaultTestRoots, 'tests/integration', 'tests/security']
  }],
  ['parse', {
    mutate: ['src/parse/index.ts', 'src/diagnostics.ts'],
    tests: integrationTestRoots
  }],
  ['plugins', {
    mutate: ['src/plugins/index.ts'],
    tests: integrationTestRoots
  }],
  ['repair', {
    mutate: ['src/repair/index.ts'],
    tests: integrationTestRoots
  }],
  ['run', {
    mutate: ['src/run/index.ts'],
    tests: securityTestRoots
  }],
  ['schema', {
    mutate: ['src/schema/index.ts'],
    tests: defaultTestRoots
  }],
  ['testing', {
    mutate: ['src/testing/index.ts'],
    tests: defaultTestRoots
  }]
]);

const [mode, ...targets] = process.argv.slice(2);

if (mode === undefined) {
  throw new Error(`Choose a mutation target: file or one of ${sourceAreaNames()}`);
}

const selection = mode === 'file'
  ? await fileSelection(targets)
  : areaSelection(mode);

const child = spawn(process.execPath, [
  strykerBin,
  'run',
  '--mutate',
  selection.mutate.join(','),
  '--reporters',
  'clear-text',
  '--concurrency',
  process.env.CLI_CORE_MUTATION_CONCURRENCY ?? '2'
], {
  cwd: repoRoot,
  env: {
    ...process.env,
    CLI_CORE_MUTATION_TEST_ROOTS: selection.tests.join(',')
  },
  stdio: 'inherit'
});

const exitCode = await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('exit', (code, signal) => {
    if (signal) {
      reject(new Error(`Mutation command terminated by ${signal}`));
      return;
    }
    resolve(code ?? 1);
  });
});

if (exitCode !== 0) {
  process.exitCode = exitCode;
}

async function fileSelection(files) {
  if (files.length === 0) {
    throw new Error('Usage: npm run test:mutation:file -- src/path/to/file.ts [src/other.ts]');
  }

  const mutate = files.map((file) => normalizeSourceFile(file));
  for (const file of mutate) {
    await access(join(repoRoot, file));
  }
  return { mutate, tests: defaultTestRoots };
}

function areaSelection(area) {
  const selection = sourceAreas.get(area);
  if (selection === undefined) {
    throw new Error(`Unknown mutation area "${area}". Choose one of ${sourceAreaNames()}`);
  }
  return selection;
}

function normalizeSourceFile(file) {
  const normalized = relative(repoRoot, join(repoRoot, file)).replaceAll('\\', '/');
  if (!normalized.startsWith('src/') || !normalized.endsWith('.ts')) {
    throw new Error(`Mutation file must be a TypeScript source file under src/: ${file}`);
  }
  return normalized;
}

function sourceAreaNames() {
  return [...sourceAreas.keys()].sort().join(', ');
}
