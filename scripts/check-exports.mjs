import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const jsrJson = JSON.parse(await readFile(new URL('../jsr.json', import.meta.url), 'utf8'));
const schemaIndex = JSON.parse(await readFile(new URL('../schemas/index.json', import.meta.url), 'utf8'));

const expectedExports = [
  '.',
  './command',
  './adapter',
  './help',
  './completion',
  './manifest',
  './config',
  './effects',
  './plugins',
  './repair',
  './schema',
  './schemas',
  './schemas/*.json',
  './testing',
  './package.json'
];

assert.deepEqual(Object.keys(packageJson.exports), expectedExports);

const expectedJsrExports = [
  '.',
  './command',
  './adapter',
  './help',
  './completion',
  './manifest',
  './config',
  './effects',
  './plugins',
  './repair',
  './schema',
  './testing',
  './schemas',
  ...schemaIndex.artifacts.map((artifact) => `./schemas/${artifact.path.replace(/^\.\//u, '')}`)
].sort();

assert.deepEqual(Object.keys(jsrJson.exports).sort(), expectedJsrExports);
assert.equal(jsrJson.name, packageJson.name);
assert.equal(jsrJson.version, packageJson.version);
