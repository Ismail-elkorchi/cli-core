import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const privateRepoName = ['tse', ['work', 'bench'].join('')].join('-');
const blocked = [
  privateRepoName,
  ['/home', 'ismail-el-korchi', 'Documents', 'Projects', privateRepoName].join('/')
];
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules', 'coverage']);
const ignoredFiles = new Set(['package-lock.json']);
const checkedExtensions = new Set(['.js', '.json', '.md', '.mjs', '.ts', '.yml', '.yaml']);

const hasCheckedExtension = (filePath) => {
  const dotIndex = filePath.lastIndexOf('.');
  return dotIndex >= 0 && checkedExtensions.has(filePath.slice(dotIndex));
};

const walk = async (directory) => {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    if (ignoredDirectories.has(entry)) continue;
    const path = join(directory, entry);
    const info = await stat(path);
    if (info.isDirectory()) {
      files.push(...await walk(path));
      continue;
    }
    if (!ignoredFiles.has(entry) && hasCheckedExtension(path)) {
      files.push(path);
    }
  }
  return files;
};

for (const file of await walk(root)) {
  const text = await readFile(file, 'utf8');
  for (const pattern of blocked) {
    assert.equal(text.includes(pattern), false, `${file} contains private marker ${pattern}`);
  }
}
