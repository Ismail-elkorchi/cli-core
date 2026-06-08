import { readFile } from 'node:fs/promises';

const PACKAGE_NAME = '@ismail-elkorchi/cli-core';

const run = async () => {
  const tagName = normalizeTag(process.env.GITHUB_REF_NAME ?? process.argv[2] ?? '');
  if (!tagName.startsWith('v')) {
    throw new Error(`release-gate: expected v-prefixed tag, received "${tagName}"`);
  }

  const version = tagName.slice(1);
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const jsrJson = JSON.parse(await readFile('jsr.json', 'utf8'));

  assertEqual(packageJson.name, PACKAGE_NAME, 'package.json name');
  assertEqual(jsrJson.name, PACKAGE_NAME, 'jsr.json name');
  assertEqual(packageJson.version, version, 'package.json version');
  assertEqual(jsrJson.version, version, 'jsr.json version');

  assertPackageMetadataSource(await readFile('src/package.ts', 'utf8'), version);
  assertPackageFileList(packageJson);

  const changelog = await readFile('CHANGELOG.md', 'utf8');
  if (!hasVersionSection(changelog, version)) {
    throw new Error(`release-gate: missing CHANGELOG section for version ${version}`);
  }

  process.stdout.write(
    `release-gate: ok tag=${tagName} package=${packageJson.version} jsr=${jsrJson.version} changelog=present\n`
  );
};

function normalizeTag(value) {
  if (!value) return '';
  return value.startsWith('refs/tags/') ? value.slice('refs/tags/'.length) : value;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`release-gate: ${label} mismatch (expected=${expected}, actual=${actual})`);
  }
}

function assertPackageMetadataSource(source, version) {
  const matches = [...source.matchAll(/\b(version|contractVersion):\s*'([^']+)'/gu)];
  if (matches.length === 0) {
    throw new Error('release-gate: src/package.ts does not expose package metadata literals');
  }

  const mismatches = matches
    .map((match) => ({ field: match[1] ?? 'unknown', value: match[2] ?? '' }))
    .filter((entry) => entry.value !== version);

  if (mismatches.length > 0) {
    const rendered = mismatches.map((entry) => `${entry.field}=${entry.value}`).join(', ');
    throw new Error(`release-gate: src/package.ts metadata mismatch (${rendered}, expected=${version})`);
  }
}

function assertPackageFileList(packageJson) {
  const files = Array.isArray(packageJson.files) ? packageJson.files : [];
  const required = ['CHANGELOG.md', 'dist', 'schemas', 'README.md', 'LICENSE'];
  const missing = required.filter((entry) => !files.includes(entry));
  if (missing.length > 0) {
    throw new Error(`release-gate: package.json files missing ${missing.join(', ')}`);
  }
  if (files.includes('AGENTS.md')) {
    throw new Error('release-gate: AGENTS.md must not be included in the npm package artifact');
  }
}

function hasVersionSection(changelog, version) {
  const lines = changelog.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    if (matchesVersionHeading(line, version)) return true;
  }
  return false;
}

function matchesVersionHeading(line, version) {
  const trimmed = line.trim();
  if (!(trimmed.startsWith('## ') || trimmed.startsWith('### '))) return false;

  const headingBody = trimmed.replace(/^#{2,3}\s+/u, '');
  const normalized = headingBody.startsWith('v') ? headingBody.slice(1) : headingBody;
  return normalized === version
    || normalized.startsWith(`${version} `)
    || normalized.startsWith(`${version}(`)
    || normalized.startsWith(`${version}-`);
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
