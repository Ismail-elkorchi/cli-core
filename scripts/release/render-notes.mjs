import { readFile } from 'node:fs/promises';

const run = async () => {
  const options = parseArgs(process.argv.slice(2));
  const tagName = normalizeTag(options.tag ?? process.env.GITHUB_REF_NAME ?? '');
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const version = tagName.startsWith('v') ? tagName.slice(1) : packageJson.version;
  const changelog = await readFile(options.changelogPath ?? 'CHANGELOG.md', 'utf8');
  const notes = extractVersionNotes(changelog, version);

  process.stdout.write(`${notes}\n`);
  if (options.dryRun) {
    process.stderr.write(`[dry-run] rendered release notes for ${version}\n`);
  }
};

function parseArgs(args) {
  const options = { dryRun: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args.at(index);
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--tag' || arg === '--to-ref') {
      const value = args.at(index + 1);
      if (!value) throw new Error(`release-notes: ${arg} expects a value`);
      options.tag = value;
      index += 1;
      continue;
    }
    if (arg === '--changelog' || arg === '--changelog-file') {
      const value = args.at(index + 1);
      if (!value) throw new Error(`release-notes: ${arg} expects a value`);
      options.changelogPath = value;
      index += 1;
      continue;
    }
    throw new Error(`release-notes: unknown argument ${arg}`);
  }
  return options;
}

function normalizeTag(value) {
  if (!value) return '';
  return value.startsWith('refs/tags/') ? value.slice('refs/tags/'.length) : value;
}

function extractVersionNotes(changelog, version) {
  const normalized = changelog.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const start = lines.findIndex((line) => matchesVersionHeading(line, version));
  if (start === -1) {
    throw new Error(`release-notes: CHANGELOG.md missing section for version ${version}`);
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines.at(index) ?? '';
    if (line.startsWith('## ')) {
      end = index;
      break;
    }
  }

  const notes = lines.slice(start + 1, end).join('\n').trim();
  if (notes.length === 0) {
    throw new Error(`release-notes: CHANGELOG.md section for version ${version} is empty`);
  }
  return notes;
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
