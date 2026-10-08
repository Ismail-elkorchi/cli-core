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

test('examples are closed, dense, non-empty, and immutable', () => {
  const examples = [{ usage: 'tool run input.txt', description: 'Process one file.' }];
  const program = defineCli({ name: 'tool', examples });
  examples[0].usage = 'changed';
  assert.deepEqual(program.root.examples, [{
    usage: 'tool run input.txt',
    description: 'Process one file.'
  }]);
  assert.equal(Object.isFrozen(program.root.examples), true);
  assert.equal(Object.isFrozen(program.root.examples[0]), true);

  const sparse = [];
  sparse.length = 1;
  for (const invalid of [
    sparse,
    [null],
    [{ usage: '' }],
    [{ usage: 'tool', description: '' }],
    [{ usage: 'tool', unsupported: true }]
  ]) {
    assert.throws(
      () => defineCli({ name: 'tool', examples: invalid }),
      (error) => error instanceof CliDefinitionError && error.issues.some((issue) =>
        issue.code === 'INVALID_EXAMPLE' || issue.code === 'UNKNOWN_PROPERTY')
    );
  }
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

test('definition adoption preserves non-enumerable data and rejects accessors without reading', () => {
  let reads = 0;
  const definition = Object.defineProperty({}, 'name', { value: 'tool' });
  assert.equal(defineCli(definition).name, 'tool');
  const accessor = Object.defineProperty({}, 'name', { get() { reads++; return 'tool'; } });
  assert.throws(() => defineCli(accessor), (error) => error instanceof CliDefinitionError && error.issues[0].code === 'INVALID_DEFINITION_DATA');
  assert.equal(reads, 0);
  const cyclic = { name: 'child' }; cyclic.commands = [cyclic];
  assert.throws(() => defineCli({ name: 'tool', commands: [cyclic] }), CliDefinitionError);
});

test('declared and effective option metadata retain one inheritance model', () => {
  const p = defineCli({ name: 'tool', options: [{ name: 'global', kind: 'boolean', flags: ['-g'] }], commands: [{ name: 'run', options: [{ name: 'local', kind: 'boolean', flags: ['-l'] }] }] });
  assert.deepEqual(p.root.declaredOptions.map(({ name }) => name), ['global']);
  assert.deepEqual(p.commands[1].declaredOptions.map(({ name }) => name), ['local']);
  assert.deepEqual(p.commands[1].options.map(({ name }) => name), ['global', 'local']);
  assert.equal(p.commands[1].options[0], p.root.declaredOptions[0]);
});

test('individual optional definition fields reject invalid values independently', () => {
  const cases = [
    [{ name: 'app', description: 1 }, 'description', 'string'],
    [{ name: 'app', invokable: 'yes' }, 'invokable', 'boolean'],
    [{ name: 'app', acceptsPassthroughArguments: 1 }, 'acceptsPassthroughArguments', 'boolean'],
    [{ name: 'app', commands: [{ name: 'run', deprecated: 1 }] }, 'deprecated', 'boolean-or-string'],
    [{ name: 'app', commands: [{ name: 'run', aliases: [{ name: 'r', deprecated: {} }] }] }, 'deprecated', 'boolean-or-string'],
    [{ name: 'app', options: [{ name: 'x', kind: 'boolean', flags: ['--x'], hidden: 'yes' }] }, 'hidden', 'boolean'],
    [{ name: 'app', options: [{ name: 'x', kind: 'boolean', flags: ['--x'], description: false }] }, 'description', 'string'],
    [{ name: 'app', positionals: [{ name: 'file', required: 'yes' }] }, 'required', 'boolean']
  ];
  for (const [definition, property, expected] of cases) {
    assert.throws(() => defineCli(definition), (error) => {
      assert(error instanceof CliDefinitionError);
      assert(error.issues.some((issue) => issue.code === 'INVALID_PROPERTY' &&
        issue.property === property && issue.expected === expected));
      return true;
    });
  }
  const valid = defineCli({
    name: 'app', description: '', invokable: false, acceptsPassthroughArguments: false,
    commands: [{ name: 'run', deprecated: false, aliases: [{ name: 'r', deprecated: 'Use run.' }],
      positionals: [{ name: 'file', required: false }],
      options: [{ name: 'x', kind: 'boolean', flags: ['--x'], hidden: false, description: '' }] }]
  });
  assert.equal(valid.root.invokable, false);
  assert.equal(findCliCommand(valid, ['run']).deprecated, undefined);
});
