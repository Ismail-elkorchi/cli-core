import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const distRoot = new URL('../dist', import.meta.url);
const declarationFiles = await findDeclarationFiles(fileURLToPath(distRoot));

for (const file of declarationFiles) {
  const text = await readFile(file, 'utf8');
  const rewritten = text.replaceAll(/((?:from|import)\s+['"](?:\.\.?\/[^'"]+))\.ts(['"])/gu, '$1.js$2');
  if (rewritten !== text) {
    await writeFile(file, rewritten);
  }
}

async function findDeclarationFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findDeclarationFiles(path));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.d.ts')) {
      files.push(path);
    }
  }

  return files;
}
