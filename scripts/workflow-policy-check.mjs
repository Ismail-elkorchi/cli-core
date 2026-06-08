import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const WORKFLOWS_DIR = path.join(ROOT, '.github', 'workflows');
const pullRequestTargetPattern = /(^|\n)\s*pull_request_target\s*:/m;
const topLevelPermissionsPattern = /^permissions:\s*$/m;

const run = async () => {
  const workflowFiles = (await readdir(WORKFLOWS_DIR))
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort((left, right) => left.localeCompare(right));

  const violations = [];

  for (const fileName of workflowFiles) {
    const workflowPath = path.join(WORKFLOWS_DIR, fileName);
    const source = (await readFile(workflowPath, 'utf8')).replace(/\r\n/g, '\n');

    const mutableRefs = findMutableRefs(source);
    if (mutableRefs.length > 0) {
      violations.push(`${fileName}: mutable action ref(s): ${mutableRefs.join(', ')}`);
    }

    if (!topLevelPermissionsPattern.test(source)) {
      violations.push(`${fileName}: missing top-level permissions block`);
    }

    if (pullRequestTargetPattern.test(source)) {
      violations.push(`${fileName}: forbidden pull_request_target trigger`);
    }

    const permissionsBlock = readTopLevelPermissionsBlock(source);
    if (!permissionsBlock) continue;

    const writeLines = permissionsBlock
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.endsWith(': write'));
    if (writeLines.length > 0) {
      violations.push(`${fileName}: top-level permissions must stay read-only (found ${writeLines.join(', ')})`);
    }
  }

  if (violations.length > 0) {
    process.stderr.write('[workflow-policy] violations detected:\n');
    for (const violation of violations) {
      process.stderr.write(`- ${violation}\n`);
    }
    process.exitCode = 1;
  }
};

function readTopLevelPermissionsBlock(source) {
  const lines = source.split('\n');
  const startIndex = lines.findIndex((line) => line === 'permissions:');
  if (startIndex === -1) return null;

  const collected = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines.at(index) ?? '';
    if (line.length === 0) {
      if (collected.length > 0) break;
      continue;
    }
    if (!line.startsWith('  ')) break;
    collected.push(line);
  }
  return collected.join('\n');
}

function findMutableRefs(source) {
  const refs = [];
  const lines = source.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('uses:') || !trimmed.includes('@')) continue;

    const atIndex = trimmed.lastIndexOf('@');
    if (atIndex === -1) continue;

    const refCandidate = trimmed.slice(atIndex + 1).split('#')[0]?.trim() ?? '';
    if (!isFullCommitSha(refCandidate)) {
      refs.push(refCandidate.length === 0 ? '(empty)' : refCandidate);
    }
  }
  return refs;
}

function isFullCommitSha(value) {
  if (value.length !== 40) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const isDigit = code >= 48 && code <= 57;
    const isLowerHex = code >= 97 && code <= 102;
    const isUpperHex = code >= 65 && code <= 70;
    if (!isDigit && !isLowerHex && !isUpperHex) return false;
  }
  return true;
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
