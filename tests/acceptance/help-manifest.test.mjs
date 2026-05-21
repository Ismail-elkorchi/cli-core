import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createHelpDocument,
  createVersionDocument,
  defineCli,
  describeCli
} from '../../dist/index.js';
import {
  exportCommandManifest,
  importCommandManifest
} from '../../dist/manifest/index.js';

test('consumer can compile a program and derive help, version, and manifest documents', () => {
  const program = defineCli({
    name: 'ship',
    version: '2.0.0',
    commands: [{ name: 'status', aliases: ['st'], description: 'Show status.' }]
  });
  const help = createHelpDocument(program);
  const version = createVersionDocument(program);
  const manifest = importCommandManifest(exportCommandManifest(describeCli(program)));

  assert.equal(help.commands[0].name, 'status');
  assert.equal(version.version, '2.0.0');
  assert.equal(manifest.commands.find((command) => command.id === 'status')?.aliases[0].name, 'st');
});
