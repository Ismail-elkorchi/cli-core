import assert from 'node:assert/strict';
import test from 'node:test';
import { defineCli, parseCli, validateCli } from '../../dist/index.js';
import { findCliCommand, findCliCommandByAlias } from '../../dist/command/public.js';

const treeDefinition = {
  name: 'tree',
  version: '1.0.0',
  options: [{ name: 'verbose', type: 'boolean', flags: ['--verbose', '-v'] }],
  commands: [
    {
      name: 'build',
      aliases: ['b'],
      options: [{ name: 'mode', type: 'string', flags: ['--mode'] }],
      positionals: [{ name: 'target', required: false }]
    },
    {
      name: 'deploy',
      commands: [
        {
          name: 'production',
          aliases: ['prod'],
          positionals: [{ name: 'service' }]
        }
      ]
    }
  ]
};

test('defineCli compiles an immutable command tree with path and alias indexes', () => {
  const program = defineCli(treeDefinition);

  assert.equal(program.schemaVersion, 'cli-core.program.v1');
  assert.equal(program.root.id, 'root');
  assert.equal(program.root.source.kind, 'definition');
  assert.equal(program.diagnostics.length, 0);
  assert.deepEqual(program.pathIndex.map((entry) => entry.path), [[], ['build'], ['deploy'], ['deploy', 'production']]);
  assert.deepEqual(program.aliasIndex.map((entry) => entry.path), [['b'], ['deploy', 'prod']]);
  assert.equal(findCliCommand(program, ['deploy', 'production'])?.id, 'deploy:production');
  assert.deepEqual(findCliCommand(program, ['build'])?.options[0], {
    name: 'mode',
    type: 'string',
    flags: ['--mode'],
    required: false,
    hidden: false,
    scope: 'local'
  });
  assert.equal(Object.hasOwn(findCliCommand(program, ['build'])?.options[0] ?? {}, 'default'), false);
  assert.equal(Object.hasOwn(findCliCommand(program, ['build'])?.options[0] ?? {}, 'allowEmpty'), false);
  assert.equal(Object.hasOwn(findCliCommand(program, ['build'])?.options[0] ?? {}, 'allowNo'), false);
  assert.equal(Object.hasOwn(findCliCommand(program, ['build'])?.positionals[0] ?? {}, 'description'), false);
  assert.throws(() => {
    program.commands.push(program.root);
  }, TypeError);
});

test('defineCli preserves command metadata, plugin source, and option defaults immutably', () => {
  const defaultTargets = ['web', 'worker'];
  const program = defineCli({
    name: 'ship',
    version: '1.2.3',
    description: 'Ship services.',
    options: [
      { name: 'targets', type: 'array', flags: ['--target'], default: defaultTargets, allowEmpty: true, hidden: true }
    ],
    commands: [
      {
        name: 'deploy',
        description: 'Deploy a service.',
        deprecated: 'Use release.',
        source: { kind: 'plugin', pluginName: 'ship-plugin', pluginVersion: '2.0.0' },
        aliases: [{ name: 'd', deprecated: true }],
        positionals: [{ name: 'service', required: false, variadic: true, description: 'Service names.' }],
        options: [{ name: 'region', type: 'boolean', flags: ['--region'], default: false, allowNo: true }]
      },
      {
        name: 'inspect',
        positionals: [{ name: 'target', description: 'Target name.' }]
      }
    ]
  });
  const command = findCliCommand(program, ['deploy']);
  const inspect = findCliCommand(program, ['inspect']);
  const alias = findCliCommandByAlias(program, ['d']);

  defaultTargets.push('mutated');
  assert.equal(program.version, '1.2.3');
  assert.equal(program.description, 'Ship services.');
  assert.equal(program.root.description, 'Ship services.');
  assert.equal(command?.description, 'Deploy a service.');
  assert.equal(command?.deprecated, 'Use release.');
  assert.deepEqual(command?.source, { kind: 'plugin', pluginName: 'ship-plugin', pluginVersion: '2.0.0' });
  assert.deepEqual(command?.positionals[0], {
    name: 'service',
    required: false,
    variadic: true,
    description: 'Service names.'
  });
  assert.equal(command?.options[0].scope, 'local');
  assert.equal(command?.options[0].default, false);
  assert.equal(command?.options[0].allowNo, true);
  assert.deepEqual(inspect?.positionals[0], {
    name: 'target',
    required: true,
    variadic: false,
    description: 'Target name.'
  });
  assert.equal(command?.inheritedOptions[0].scope, 'global');
  assert.equal(command?.inheritedOptions[0].hidden, true);
  assert.equal(command?.inheritedOptions[0].allowEmpty, true);
  assert.deepEqual(command?.inheritedOptions[0].default, ['web', 'worker']);
  assert.throws(() => {
    command?.inheritedOptions[0].default.push('other');
  }, TypeError);
  assert.equal(alias?.alias.deprecated, true);
});

test('defineCli reports invalid command names and aliases without indexing them', () => {
  const program = defineCli({
    name: '',
    commands: [
      { name: '' },
      { name: 'bad\u0000name' },
      { name: 'valid', aliases: ['', 'bad\u0000alias', 'v'] }
    ]
  });

  assert.deepEqual(program.diagnostics.map((diagnostic) => diagnostic.code), [
    'CLI_COMMAND_NAME_INVALID',
    'CLI_COMMAND_NAME_INVALID',
    'CLI_COMMAND_NAME_INVALID',
    'CLI_COMMAND_ALIAS_INVALID',
    'CLI_COMMAND_ALIAS_INVALID'
  ]);
  assert.equal(findCliCommand(program, ['valid'])?.id, 'valid');
  assert.equal(program.root.name, '');
  assert.equal(findCliCommandByAlias(program, ['v'])?.command.id, 'valid');
  assert.equal(findCliCommandByAlias(program, ['']), undefined);
  assert.deepEqual(program.diagnostics[0].fields, { path: [], name: '', role: 'root' });
  assert.deepEqual(program.diagnostics[1].fields, { path: [''], name: '', parentPath: [] });
  assert.deepEqual(program.diagnostics[3].fields.path, ['']);
});

test('defineCli reports duplicate and invalid option definitions', () => {
  const program = defineCli({
    name: 'options',
    options: [
      { name: 'verbose', type: 'boolean', flags: ['--verbose'] },
      { name: 'verbose', type: 'boolean', flags: ['--verbose-again'] },
      { name: '', type: 'boolean', flags: ['--empty'] },
      { name: 'badFlag', type: 'boolean', flags: ['verbose'] },
      { name: 'badPrefix', type: 'boolean', flags: ['x--bad'] },
      { name: 'badWhitespace', type: 'boolean', flags: ['--bad flag'] },
      { name: 'badAllowNo', type: 'string', allowNo: true, flags: ['--bad-allow-no'] },
      { name: 'badAllowEmpty', type: 'number', allowEmpty: true, flags: ['--bad-allow-empty'] },
      { name: 'noFlags', type: 'boolean', flags: [] },
      { name: 'dupeFlag', type: 'boolean', flags: ['--shared', '--shared'] }
    ],
    commands: [
      {
        name: 'run',
        options: [
          { name: 'verbose', type: 'boolean', flags: ['--local'] },
          { name: 'mode', type: 'string', flags: ['--verbose'] },
          { name: 'safe', type: 'boolean', flags: ['--safe'] }
        ]
      }
    ]
  });
  const command = findCliCommand(program, ['run']);

  assert.deepEqual(program.diagnostics.map((diagnostic) => diagnostic.code), [
    'CLI_OPTION_NAME_DUPLICATE',
    'CLI_OPTION_NAME_INVALID',
    'CLI_OPTION_FLAG_INVALID',
    'CLI_OPTION_FLAG_INVALID',
    'CLI_OPTION_FLAG_INVALID',
    'CLI_OPTION_FLAG_INVALID',
    'CLI_OPTION_FLAG_INVALID',
    'CLI_OPTION_FLAG_INVALID',
    'CLI_OPTION_FLAG_DUPLICATE',
    'CLI_OPTION_NAME_DUPLICATE',
    'CLI_OPTION_FLAG_DUPLICATE'
  ]);
  assert.deepEqual(program.diagnostics[1].fields, {
    commandPath: [],
    option: '',
    scope: 'global',
    reason: 'name'
  });
  assert.equal(program.diagnostics[3].fields.flag, 'x--bad');
  assert.equal(program.diagnostics[5].fields.flag, 'allowNo');
  assert.equal(program.diagnostics[5].fields.reason, 'allowNo is only valid for boolean options.');
  assert.equal(program.diagnostics[6].fields.flag, 'allowEmpty');
  assert.equal(program.diagnostics[6].fields.reason, 'allowEmpty is only valid for string or array options.');
  assert.equal(program.diagnostics[7].fields.flag, '');
  assert.equal(program.diagnostics[8].fields.existingOption, 'dupeFlag');
  assert.equal(program.diagnostics[10].fields.existingOption, 'verbose');
  assert.deepEqual(program.root.inheritedOptions.map((option) => option.name), ['verbose']);
  assert.deepEqual(command?.options.map((option) => option.name), ['safe']);
});

test('defineCli reports invalid positional ordering', () => {
  const program = defineCli({
    name: 'positionals',
    commands: [
      {
        name: 'copy',
        positionals: [
          { name: '', required: true },
          { name: 'source', required: false },
          { name: 'target', required: true },
          { name: 'rest', variadic: true },
          { name: 'after' }
        ]
      }
    ]
  });
  const command = findCliCommand(program, ['copy']);

  assert.deepEqual(program.diagnostics.map((diagnostic) => diagnostic.code), [
    'CLI_POSITIONAL_INVALID',
    'CLI_POSITIONAL_INVALID',
    'CLI_POSITIONAL_INVALID',
    'CLI_POSITIONAL_INVALID',
    'CLI_POSITIONAL_INVALID'
  ]);
  assert.deepEqual(program.diagnostics.map((diagnostic) => diagnostic.fields.reason), [
    'name',
    'required_after_optional',
    'required_after_optional',
    'variadic_not_last',
    'after_variadic'
  ]);
  assert.deepEqual(command?.positionals.map((positional) => positional.name), ['source', 'target', 'rest']);
});

test('defineCli accepts multiple required positionals before any optional positional', () => {
  const program = defineCli({
    name: 'positionals-ok',
    commands: [
      {
        name: 'copy',
        positionals: [
          { name: 'source' },
          { name: 'target' }
        ]
      }
    ]
  });
  const command = findCliCommand(program, ['copy']);

  assert.equal(program.diagnostics.length, 0);
  assert.deepEqual(command?.positionals, [
    { name: 'source', required: true, variadic: false },
    { name: 'target', required: true, variadic: false }
  ]);
});

test('defineCli keeps adjacent and nested command path keys distinct', () => {
  const program = defineCli({
    name: 'keys',
    commands: [
      { name: 'ab' },
      { name: 'a', commands: [{ name: 'b' }] }
    ]
  });

  assert.equal(program.diagnostics.length, 0);
  assert.equal(findCliCommand(program, ['ab'])?.id, 'ab');
  assert.equal(findCliCommand(program, ['a', 'b'])?.id, 'a:b');
});

test('defineCli reports duplicate command paths and alias conflicts as diagnostics', () => {
  const program = defineCli({
    name: 'dupe',
    commands: [
      { name: 'run' },
      { name: 'run' },
      { name: 'start', aliases: ['run'] }
    ]
  });

  assert.deepEqual(program.diagnostics.map((diagnostic) => diagnostic.code), [
    'CLI_DUPLICATE_COMMAND_PATH',
    'CLI_ALIAS_CONFLICTS_WITH_COMMAND'
  ]);
  assert.deepEqual(program.diagnostics[0].fields, {
    path: ['run'],
    commandId: 'run',
    existingCommandId: 'run'
  });
  assert.deepEqual(program.diagnostics[1].fields, {
    path: ['run'],
    commandId: 'start',
    existingCommandId: 'run'
  });
});

test('defineCli reports duplicate command aliases as diagnostics', () => {
  const program = defineCli({
    name: 'dupe-alias',
    commands: [
      { name: 'install', aliases: ['i'] },
      { name: 'inspect', aliases: ['i'] }
    ]
  });

  assert.equal(program.diagnostics.length, 1);
  assert.equal(program.diagnostics[0].code, 'CLI_DUPLICATE_COMMAND_ALIAS');
  assert.equal(program.diagnostics[0].severity, 'error');
  assert.deepEqual(program.diagnostics[0].fields.path, ['i']);
});

test('parseCli binds command aliases, global options, local options, and positionals', async () => {
  const program = defineCli(treeDefinition);
  const invocation = parseCli(program, {
    argv: ['b', '--verbose', '--mode', 'release', 'web']
  });

  assert.equal(invocation.ok, true);
  assert.deepEqual(invocation.commandPath, ['build']);
  assert.equal(invocation.usedAlias?.token, 'b');
  assert.deepEqual(invocation.options.values, {
    verbose: true,
    mode: 'release'
  });
  assert.deepEqual(invocation.options.present, {
    verbose: true,
    mode: true
  });
  assert.deepEqual(invocation.positionals, { target: 'web' });

  const validation = await validateCli(program, invocation);
  assert.equal(validation.ok, true);
});

test('parseCli returns structured diagnostics for unknown commands and missing inputs', () => {
  const program = defineCli(treeDefinition);
  const unknown = parseCli(program, { argv: ['ship'] });
  const missing = parseCli(program, { argv: ['deploy', 'production'] });
  const unknownOption = parseCli(program, { argv: ['build', '--missing'] });

  assert.equal(unknown.ok, false);
  assert.equal(unknown.diagnostics[0].code, 'CLI_UNKNOWN_COMMAND');
  assert.equal(missing.ok, false);
  assert.equal(missing.diagnostics[0].code, 'CLI_MISSING_POSITIONAL');
  assert.equal(unknownOption.ok, false);
  assert.equal(unknownOption.diagnostics[0].code, 'CLI_UNKNOWN_OPTION');
  assert.deepEqual(unknownOption.options.unknown, ['--missing']);
});

test('validateCli preserves parse failures as semantic validation failures', async () => {
  const program = defineCli(treeDefinition);
  const invocation = parseCli(program, { argv: ['ship'] });
  const validation = await validateCli(program, invocation);

  assert.equal(validation.ok, false);
  assert.equal(validation.diagnostics[0].code, 'CLI_UNKNOWN_COMMAND');
});

test('parseCli preserves pass-through tokens after the double dash boundary', () => {
  const program = defineCli({
    name: 'proxy',
    commands: [
      {
        name: 'exec',
        allowPassThrough: true,
        options: [{ name: 'profile', type: 'string', flags: ['--profile'] }],
        positionals: [{ name: 'script' }]
      }
    ]
  });

  const invocation = parseCli(program, {
    argv: ['exec', '--profile', 'agent', 'build', '--', '--trace', '--limit=2']
  });

  assert.equal(invocation.ok, true);
  assert.deepEqual(invocation.commandPath, ['exec']);
  assert.deepEqual(invocation.positionals, { script: 'build' });
  assert.deepEqual(invocation.passThrough, ['--trace', '--limit=2']);
});

test('deprecated aliases produce warnings without failing invocation validity', () => {
  const program = defineCli({
    name: 'deprecated',
    commands: [
      {
        name: 'remove',
        aliases: [{ name: 'rm', deprecated: 'Use remove instead.' }],
        positionals: [{ name: 'target' }]
      }
    ]
  });

  const invocation = parseCli(program, { argv: ['rm', 'old-file'] });

  assert.equal(invocation.ok, true);
  assert.equal(invocation.diagnostics[0].code, 'CLI_DEPRECATED_ALIAS');
  assert.equal(invocation.diagnostics[0].severity, 'warning');
});
