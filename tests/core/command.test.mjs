import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CliDefinitionError,
  defineCli,
  findCliCommand,
  findCliCommandChildren
} from '../../dist/index.js';

test('defineCli compiles immutable literal command data with inherited option facts', () => {
  const flags = ['-v', '--verbose'];
  const program = defineCli({
    name: 'ship',
    options: [{ name: 'verbose', kind: 'boolean', flags }],
    commands: [{
      name: 'project',
      aliases: [{ name: 'p', deprecated: 'Use project.' }],
      options: [{
        name: 'config',
        kind: 'value',
        flags: ['--config'],
        valueMode: 'required'
      }],
      commands: [{
        name: 'deploy',
        options: [{ name: 'region', kind: 'value', flags: ['--region'], valueMode: 'required' }]
      }]
    }]
  });
  flags[0] = '-q';

  const project = findCliCommand(program, ['project']);
  const deploy = findCliCommand(program, ['project', 'deploy']);
  assert.equal(deploy?.key, 'ship project deploy');
  assert.deepEqual(deploy?.options.map((option) => option.name), ['verbose', 'config', 'region']);
  assert.deepEqual(deploy?.options.map((option) => option.definedAt), [[], ['project'], ['project', 'deploy']]);
  assert.deepEqual(deploy?.options[0].flags, ['-v', '--verbose']);
  assert.deepEqual(project?.aliases[0], {
    name: 'p',
    path: ['p'],
    deprecated: 'Use project.'
  });
  assert.deepEqual(findCliCommandChildren(program, program.root), [project]);
  assert.deepEqual(program.commands.map((command) => command.key), [
    'ship',
    'ship project',
    'ship project deploy'
  ]);
  assert.equal(Object.isFrozen(program), true);
});

test('command keys remain distinct for punctuation in path tokens', () => {
  const program = defineCli({
    name: 'tool',
    commands: [
      { name: 'a:b', commands: [{ name: 'c' }] },
      { name: 'a', commands: [{ name: 'b:c' }] }
    ]
  });
  assert.notEqual(
    findCliCommand(program, ['a:b', 'c'])?.key,
    findCliCommand(program, ['a', 'b:c'])?.key
  );
});

test('definition compilation aggregates malformed and ambiguous input', () => {
  assert.throws(
    () => defineCli({
      name: 'ship',
      unsupported: true,
      options: [
        { name: 'verbose', kind: 'boolean', flags: ['-v'] },
        { name: 'verbose', kind: 'boolean', flags: ['-v'] }
      ],
      commands: [{
        name: 'deploy',
        aliases: ['d'],
        positionals: [
          { name: 'environment', required: false },
          { name: 'service', required: true }
        ],
        commands: [{ name: 'nested' }]
      }, { name: 'd' }]
    }),
    (error) => {
      assert.equal(error instanceof CliDefinitionError, true);
      assert.equal(error.name, 'CliDefinitionError');
      assert.equal(error.message, 'Invalid CLI definition (6 issues).');
      assert.equal(error.issues.length, 6);
      const rootOptionIssue = error.issues.find((issue) =>
        issue.code === 'INVALID_OPTION' && issue.commandPath.length === 0);
      assert.equal(Object.isFrozen(rootOptionIssue?.commandPath), true);
      assert.throws(() => rootOptionIssue.commandPath.push('changed'), TypeError);
      const codes = new Set(error.issues.map((issue) => issue.code));
      assert.equal(codes.has('UNKNOWN_PROPERTY'), true);
      assert.equal(codes.has('INVALID_OPTION'), true);
      assert.equal(codes.has('INVALID_POSITIONAL'), true);
      assert.equal(codes.has('DUPLICATE_COMMAND'), true);
      assert.equal(codes.has('AMBIGUOUS_COMMAND_INPUT'), true);
      return true;
    }
  );
});

test('flag spellings stay binder-neutral and inherited collisions are rejected', () => {
  assert.equal(defineCli({
    name: 'ship',
    options: [{ name: 'global option', kind: 'boolean', flags: ['-ab'] }]
  }).root.options[0]?.name, 'global option');
  assert.throws(
    () => defineCli({
      name: 'ship',
      options: [{ name: 'global', kind: 'boolean', flags: [''] }]
    }),
    (error) => error instanceof CliDefinitionError &&
      error.message === 'Invalid CLI definition (1 issue).' &&
      error.issues.some((issue) => issue.code === 'INVALID_OPTION' && issue.reason === 'flags')
  );
  assert.throws(
    () => defineCli({
      name: 'ship',
      options: [{ name: 'global', kind: 'boolean', flags: ['--global'] }],
      commands: [{
        name: 'deploy',
        options: [{ name: 'global', kind: 'boolean', flags: ['--local'] }]
      }]
    }),
    (error) => error instanceof CliDefinitionError &&
      error.issues.some((issue) => issue.code === 'INVALID_OPTION' && issue.reason === 'duplicate-name')
  );
});

test('definition arrays are dense and command groups must contain children', () => {
  const sparseFlags = [];
  sparseFlags.length = 1;
  const sparseFalseFlags = [];
  sparseFalseFlags.length = 1;
  const sparseCandidates = [];
  sparseCandidates.length = 1;

  for (const option of [
    { name: 'sparse', kind: 'boolean', flags: sparseFlags },
    { name: 'sparse', kind: 'boolean', flags: ['-s'], falseFlags: sparseFalseFlags },
    {
      name: 'sparse',
      kind: 'value',
      flags: ['-s'],
      valueMode: 'required',
      valueCandidates: sparseCandidates
    }
  ]) {
    assert.throws(
      () => defineCli({ name: 'tool', options: [option] }),
      (error) => error instanceof CliDefinitionError &&
        error.issues.some((issue) => issue.code === 'INVALID_OPTION')
    );
  }

  assert.throws(
    () => defineCli({ name: 'tool', commands: [{ name: 'group', invokable: false }] }),
    (error) => error instanceof CliDefinitionError &&
      error.issues.some((issue) => issue.code === 'NON_INVOKABLE_LEAF')
  );
  assert.throws(
    () => defineCli({
      name: 'tool',
      positionals: [{ name: 'input' }],
      commands: [{ name: 'run' }]
    }),
    (error) => error instanceof CliDefinitionError &&
      error.issues.some((issue) => issue.code === 'AMBIGUOUS_COMMAND_INPUT')
  );
});

test('option presentation cannot claim values that the option does not materialize', () => {
  assert.throws(
    () => defineCli({
      name: 'ship',
      options: [{
        name: 'region',
        kind: 'value',
        flags: ['--region'],
        valueMode: 'required',
        hasDefault: false,
        defaultLabel: 'eu'
      }]
    }),
    (error) => error instanceof CliDefinitionError && error.issues.some((issue) =>
      issue.code === 'INVALID_OPTION' && issue.reason === 'presentation')
  );
  assert.throws(
    () => defineCli({
      name: 'ship',
      options: [{
        name: 'region',
        kind: 'value',
        flags: ['--region'],
        valueMode: 'required',
        implicitValueLabel: 'automatic'
      }]
    }),
    (error) => error instanceof CliDefinitionError && error.issues.some((issue) =>
      issue.code === 'INVALID_OPTION' && issue.reason === 'presentation')
  );
  assert.throws(
    () => defineCli({
      name: 'ship',
      options: [{
        name: 'region',
        kind: 'value',
        flags: ['--region'],
        valueMode: 'required',
        required: true,
        hasDefault: true
      }]
    }),
    (error) => error instanceof CliDefinitionError && error.issues.some((issue) =>
      issue.code === 'INVALID_OPTION' && issue.reason === 'presentation')
  );
  assert.throws(
    () => defineCli({
      name: 'ship',
      options: [{
        name: 'tag',
        kind: 'value',
        flags: ['--tag'],
        valueMode: 'required',
        multiple: true,
        repeat: 'first'
      }]
    }),
    (error) => error instanceof CliDefinitionError && error.issues.some((issue) =>
      issue.code === 'INVALID_OPTION' && issue.reason === 'repeat')
  );
});
