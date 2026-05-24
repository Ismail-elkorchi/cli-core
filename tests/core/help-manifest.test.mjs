import assert from 'node:assert/strict';
import test from 'node:test';
import { createHelpDocument, defineCli, describeCli } from '../../dist/index.js';
import { createVersionDocument } from '../../dist/help/index.js';
import { exportCommandManifest, importCommandManifest } from '../../dist/manifest/index.js';

const program = defineCli({
  name: 'ship',
  version: '1.2.3',
  description: 'Deploy services.',
  options: [
    { name: 'verbose', type: 'boolean', flags: ['--verbose', '-v'], description: 'Show more detail.' },
    { name: 'token', type: 'string', flags: ['--token'], hidden: true }
  ],
  commands: [
    {
      name: 'deploy',
      aliases: ['d'],
      description: 'Deploy a service.',
      source: { kind: 'plugin', pluginName: 'ship-deploy', pluginVersion: '1.0.0' },
      allowPassThrough: true,
      options: [
        { name: 'region', type: 'string', flags: ['--region'], required: true },
        { name: 'secret', type: 'string', flags: ['--secret'], hidden: true }
      ],
      positionals: [{ name: 'service', description: 'Service name.' }]
    }
  ]
});

test('createHelpDocument returns a machine-readable help document', () => {
  const rootHelp = createHelpDocument(program);
  const commandHelp = createHelpDocument(program, ['deploy']);

  assert.equal(rootHelp.schemaVersion, 'cli-core.help.v1');
  assert.equal(rootHelp.usage, 'ship [options]');
  assert.deepEqual(rootHelp.commandPath, []);
  assert.deepEqual(rootHelp.commands.map((command) => command.name), ['deploy']);
  assert.deepEqual(rootHelp.commands[0].aliases, ['d']);
  assert.deepEqual(rootHelp.commands[0].source, { kind: 'plugin', pluginName: 'ship-deploy', pluginVersion: '1.0.0' });
  assert.equal(commandHelp.usage, 'ship deploy [options] <service> [-- ...]');
  assert.deepEqual(commandHelp.options.map((option) => option.name), ['verbose', 'region']);
  assert.deepEqual(commandHelp.positionals, [
    {
      name: 'service',
      required: true,
      variadic: false,
      label: '<service>',
      summary: 'Service name.'
    }
  ]);
});

test('createHelpDocument hides hidden options from help and usage', () => {
  const hiddenOnly = defineCli({
    name: 'hidden',
    options: [{ name: 'token', type: 'string', flags: ['--token'], hidden: true }],
    commands: [
      {
        name: 'run',
        options: [{ name: 'secret', type: 'string', flags: ['--secret'], hidden: true }]
      },
      { name: 'Stryker was here', description: 'Ensures default help stays rooted.' }
    ]
  });
  const rootHelp = createHelpDocument(hiddenOnly);
  const commandHelp = createHelpDocument(hiddenOnly, ['run']);

  assert.equal(rootHelp.usage, 'hidden');
  assert.deepEqual(rootHelp.commandPath, []);
  assert.deepEqual(rootHelp.options, []);
  assert.equal(commandHelp.usage, 'hidden run');
  assert.deepEqual(commandHelp.options, []);
});

test('createHelpDocument formats optional variadic positional labels', () => {
  const variadic = defineCli({
    name: 'files',
    commands: [
      {
        name: 'watch',
        positionals: [{ name: 'paths', required: false, variadic: true }]
      }
    ]
  });
  const help = createHelpDocument(variadic, ['watch']);

  assert.equal(help.usage, 'files watch [paths...]');
  assert.deepEqual(help.positionals[0], {
    name: 'paths',
    required: false,
    variadic: true,
    label: '[paths...]',
    summary: undefined
  });
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
  const importedFromObject = importCommandManifest(manifest);

  assert.equal(manifest.schemaVersion, 'cli-core.manifest.v1');
  assert.equal(manifest.package.name, '@ismail-elkorchi/cli-core');
  assert.equal(manifest.diagnostics.length, 0);
  assert.deepEqual(imported.package, manifest.package);
  assert.equal(imported.program.name, 'ship');
  assert.deepEqual(imported.commands.map((command) => command.path), [[], ['deploy']]);
  assert.deepEqual(imported.commands[1].aliases[0].path, ['d']);
  assert.deepEqual(imported.commands[1].source, { kind: 'plugin', pluginName: 'ship-deploy', pluginVersion: '1.0.0' });
  assert.deepEqual(imported.commands[1].positionals, [
    {
      name: 'service',
      required: true,
      variadic: false,
      description: 'Service name.'
    }
  ]);
  assert.deepEqual(imported.commands[1].options[0].flags, ['--region']);
  assert.deepEqual(imported.commands[1].inheritedOptions.map((option) => option.flags), [['--verbose', '-v'], ['--token']]);
  assert.equal(importedFromObject.commands[1].id, 'deploy');
  assert.throws(() => {
    imported.commands.push(imported.commands[0]);
  }, TypeError);
  assert.throws(() => {
    imported.commands[1].aliases[0].path.push('mutated');
  }, TypeError);
  assert.throws(() => {
    imported.commands[1].options[0].flags.push('--other');
  }, TypeError);
});

test('describeCli preserves program diagnostics in the manifest', () => {
  const invalid = defineCli({
    name: 'invalid',
    commands: [{ name: 'run' }, { name: 'run' }]
  });
  const manifest = describeCli(invalid);
  const imported = importCommandManifest(exportCommandManifest(manifest));

  assert.deepEqual(manifest.diagnostics.map((diagnostic) => diagnostic.code), ['CLI_DUPLICATE_COMMAND_PATH']);
  assert.deepEqual(imported.diagnostics.map((diagnostic) => diagnostic.code), ['CLI_DUPLICATE_COMMAND_PATH']);
});

test('importCommandManifest rejects unsupported or malformed manifests', () => {
  const cases = [
    [null, 'Command manifest must be an object.'],
    [[], 'Command manifest must be an object.'],
    [{ schemaVersion: 'other' }, 'Unsupported command manifest schemaVersion.'],
    [{ schemaVersion: 'cli-core.manifest.v1' }, 'Command manifest package must be an object.'],
    [{ schemaVersion: 'cli-core.manifest.v1', package: {} }, 'Command manifest program must be an object.'],
    [
      { schemaVersion: 'cli-core.manifest.v1', package: {}, program: {}, commands: {}, diagnostics: [] },
      'Command manifest commands must be an array.'
    ],
    [
      { schemaVersion: 'cli-core.manifest.v1', package: {}, program: {}, commands: [] },
      'Command manifest diagnostics must be an array.'
    ],
    [
      '{"schemaVersion":"cli-core.manifest.v1","commands":[]}',
      'Command manifest package must be an object.'
    ]
  ];

  for (const [input, message] of cases) {
    assert.throws(() => importCommandManifest(input), { name: 'TypeError', message });
  }
});
