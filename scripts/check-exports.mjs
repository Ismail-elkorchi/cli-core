import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const expectedExports = [
  '.',
  './help',
  './completion',
  './manifest',
  './config',
  './effects',
  './plugins',
  './repair',
  './schema',
  './testing',
  './package.json'
];

assert.deepEqual(Object.keys(packageJson.exports), expectedExports);
