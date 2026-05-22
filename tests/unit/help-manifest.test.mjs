import assert from 'node:assert/strict';
import test from 'node:test';
import { createHelpDocument, defineCli, describeCli } from '../../dist/index.js';
import { createVersionDocument } from '../../dist/help/index.js';
import { exportCommandManifest, importCommandManifest } from '../../dist/manifest/index.js';

const program = defineCli({
  name: 'ship',
  version: '1.2.3',
  description: 'Deploy services.',
  options: [{ name: 'verbose', type: 'boolean', flags: ['--verbose', '-v'], description: 'Show more detail.' }],
  commands: [
    {
      name: 'deploy',
      aliases: ['d'],
      description: 'Deploy a service.',
      options: [{ name: 'region', type: 'string', flags: ['--region'], required: true }],
      positionals: [{ name: 'service' }]
    }
  ]
});

test('createHelpDocument returns a machine-readable help document', () => {
  const rootHelp = createHelpDocument(program);
  const commandHelp = createHelpDocument(program, ['deploy']);

  assert.equal(rootHelp.schemaVersion, 'cli-core.help.v1');
  assert.equal(rootHelp.usage, 'ship [options]');
  assert.deepEqual(rootHelp.commands.map((command) => command.name), ['deploy']);
  assert.equal(commandHelp.usage, 'ship deploy [options] <service>');
  assert.deepEqual(commandHelp.options.map((option) => option.name), ['verbose', 'region']);
});

test('createVersionDocument returns package version data without writing output', () => {
  const version = createVersionDocument(program);

  assert.deepEqual(version, {
    schemaVersion: 'cli-core.version.v1',
    name: 'ship',
    version: '1.2.3'
  });
});

test('describeCli exports and imports a command manifest', () => {
  const manifest = describeCli(program);
  const exported = exportCommandManifest(manifest);
  const imported = importCommandManifest(exported);

  assert.equal(manifest.schemaVersion, 'cli-core.manifest.v1');
  assert.equal(imported.program.name, 'ship');
  assert.deepEqual(imported.commands.map((command) => command.path), [[], ['deploy']]);
  assert.throws(() => {
    imported.commands.push(imported.commands[0]);
  }, TypeError);
});
