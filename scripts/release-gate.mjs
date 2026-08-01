import { readFile } from 'node:fs/promises';

const tag = normalizeTag(process.env.GITHUB_REF_NAME ?? process.argv[2] ?? '');
if (!tag.startsWith('v')) {
  throw new Error(`release-gate: expected v-prefixed tag, received "${tag}"`);
}

const version = tag.slice(1);
const [packageJson, jsrJson, packageSource, changelog] = await Promise.all([
  readJson('package.json'),
  readJson('jsr.json'),
  readFile('src/package.ts', 'utf8'),
  readFile('CHANGELOG.md', 'utf8')
]);

assertEqual(packageJson.version, version, 'package.json version');
assertEqual(jsrJson.version, version, 'jsr.json version');

const publicVersions = [...packageSource.matchAll(/\bversion:\s*'([^']+)'/gu)]
  .map((match) => match[1]);
if (publicVersions.length === 0 || publicVersions.some((value) => value !== version)) {
  throw new Error(`release-gate: src/package.ts version does not match ${version}`);
}

if (!hasVersionHeading(changelog, version)) {
  throw new Error(`release-gate: missing CHANGELOG section for version ${version}`);
}

process.stdout.write(`release-gate: ok tag=${tag} version=${version}\n`);

function normalizeTag(value) {
  return value.startsWith('refs/tags/') ? value.slice('refs/tags/'.length) : value;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`release-gate: ${label} mismatch (expected=${expected}, actual=${actual})`);
  }
}

function hasVersionHeading(changelog, version) {
  return changelog.replace(/\r\n/gu, '\n').split('\n').some((line) => {
    const trimmed = line.trim();
    if (!(trimmed.startsWith('## ') || trimmed.startsWith('### '))) return false;

    const heading = trimmed.replace(/^#{2,3}\s+/u, '');
    const normalized = heading.startsWith('v') ? heading.slice(1) : heading;
    return normalized === version
      || normalized.startsWith(`${version} `)
      || normalized.startsWith(`${version}(`)
      || normalized.startsWith(`${version}-`);
  });
}
