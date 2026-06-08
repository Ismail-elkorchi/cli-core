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
  const packageVersions = extractMetadataLiteralValues(source, 'version');
  if (packageVersions.length === 0) {
    throw new Error('release-gate: src/package.ts does not expose package version literals');
  }
  assertSameValues(packageVersions, 'src/package.ts version');
  assertEqual(packageVersions[0], version, 'src/package.ts version');

  const contractVersions = extractMetadataLiteralValues(source, 'contractVersion');
  if (contractVersions.length === 0) {
    throw new Error('release-gate: src/package.ts does not expose contractVersion literals');
  }
  assertSameValues(contractVersions, 'src/package.ts contractVersion');
  if (!isSemverLike(contractVersions[0])) {
    throw new Error(
      `release-gate: src/package.ts contractVersion must be semver-like (actual=${contractVersions[0]})`
    );
  }
}

function extractMetadataLiteralValues(source, field) {
  const token = `${field}: '`;
  const values = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf(token, cursor);
    if (start === -1) break;

    const valueStart = start + token.length;
    const valueEnd = source.indexOf("'", valueStart);
    if (valueEnd === -1) break;

    values.push(source.slice(valueStart, valueEnd));
    cursor = valueEnd + 1;
  }

  return values;
}

function assertSameValues(values, label) {
  const [expected] = values;
  const mismatches = values.filter((value) => value !== expected);
  if (mismatches.length > 0) {
    throw new Error(`release-gate: ${label} literals are not consistent`);
  }
}

function isSemverLike(value) {
  const suffixStart = firstSuffixIndex(value);
  const base = suffixStart === -1 ? value : value.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? '' : value.slice(suffixStart + 1);
  const parts = base.split('.');

  return parts.length === 3
    && parts.every(isDigits)
    && (suffixStart === -1 || isSemverSuffix(suffix));
}

function firstSuffixIndex(value) {
  const prerelease = value.indexOf('-');
  const build = value.indexOf('+');
  if (prerelease === -1) return build;
  if (build === -1) return prerelease;
  return Math.min(prerelease, build);
}

function isSemverSuffix(value) {
  if (value.length === 0) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const isDigit = code >= 48 && code <= 57;
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    const isSeparator = code === 45 || code === 46;
    if (!isDigit && !isUpper && !isLower && !isSeparator) return false;
  }
  return true;
}

function isDigits(value) {
  if (value.length === 0) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 48 || code > 57) return false;
  }
  return true;
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
