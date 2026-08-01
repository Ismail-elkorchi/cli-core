import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CliDefinitionError,
  defineCli,
  findCliCommand,
  findCliCommandByAlias,
  findCliCommandChildren
} from '../../dist/index.js';

test('defineCli compiles an immutable command tree with private lookup data', () => {
  const flags = ['-v', '--verbose'];
  const commands = [{
    name: 'deploy',
    aliases: [{ name: 'd', deprecated: 'Use deploy.' }],
    positionals: [{ name: 'service' }]
  }];
  const program = defineCli({
    name: 'ship',
    options: [{ name: 'verbose', flags, valueMode: 'none' }],
    commands
  });

  flags[0] = '-q';
  commands[0].name = 'changed';

  const deploy = findCliCommand(program, ['deploy']);
  assert.equal(deploy?.key, 'ship deploy');
  assert.deepEqual(deploy?.options[0].flags, ['-v', '--verbose']);
  assert.equal(findCliCommandByAlias(program, ['d'])?.command, deploy);
  assert.deepEqual(findCliCommandChildren(program, program.root), [deploy]);
  assert.equal(Object.isFrozen(program), true);
  assert.equal(Object.isFrozen(program.commands), true);
  assert.equal('pathIndex' in program, false);
  assert.equal('aliasIndex' in program, false);
});

test('command keys remain distinct for punctuation in path tokens', () => {
  const program = defineCli({
    name: 'tool',
    commands: [
      { name: 'a:b', commands: [{ name: 'c' }] },
      { name: 'a', commands: [{ name: 'b:c' }] }
    ]
  });
  assert.notEqual(findCliCommand(program, ['a:b', 'c'])?.key, findCliCommand(program, ['a', 'b:c'])?.key);
});

test('definition compilation rejects malformed, ambiguous, and unknown input together', () => {
  assert.throws(
    () => defineCli({
      name: 'ship',
      unsupported: true,
      options: [
        { name: 'verbose', flags: ['-v'], valueMode: 'none' },
        { name: 'verbose', flags: ['-v'], valueMode: 'none' }
      ],
      commands: [
        {
          name: 'deploy',
          aliases: ['d'],
          positionals: [
            { name: 'environment', required: false },
            { name: 'service', required: true }
          ]
        },
        { name: 'd' }
      ]
    }),
    (error) => {
      assert.equal(error instanceof CliDefinitionError, true);
      const codes = new Set(error.issues.map((issue) => issue.code));
      assert.equal(codes.has('UNKNOWN_PROPERTY'), true);
      assert.equal(codes.has('INVALID_OPTION'), true);
      assert.equal(codes.has('INVALID_POSITIONAL'), true);
      assert.equal(codes.has('DUPLICATE_COMMAND'), true);
      return true;
    }
  );
});

test('definition compilation rejects parser metadata that cannot be represented truthfully', () => {
  assert.throws(
    () => defineCli({
      name: 'ship',
      options: [{ name: 'verbose', flags: ['-v'], valueMode: 'none', valueLabel: 'level' }]
    }),
    (error) => error instanceof CliDefinitionError
      && error.issues.some((issue) => issue.code === 'INVALID_OPTION' && issue.reason === 'value-label')
  );
});
