import assert from 'node:assert/strict';
import test from 'node:test';
import { defineCli, findCliCommand, parseCli, validateCli } from '../../dist/index.js';

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
  assert.equal(program.diagnostics.length, 0);
  assert.deepEqual(program.pathIndex.map((entry) => entry.path), [[], ['build'], ['deploy'], ['deploy', 'production']]);
  assert.deepEqual(program.aliasIndex.map((entry) => entry.path), [['b'], ['deploy', 'prod']]);
  assert.equal(findCliCommand(program, ['deploy', 'production'])?.id, 'deploy:production');
  assert.throws(() => {
    program.commands.push(program.root);
  }, TypeError);
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

  assert.equal(unknown.ok, false);
  assert.equal(unknown.diagnostics[0].code, 'CLI_UNKNOWN_COMMAND');
  assert.equal(missing.ok, false);
  assert.equal(missing.diagnostics[0].code, 'CLI_MISSING_POSITIONAL');
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
