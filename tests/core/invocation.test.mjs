import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCliDiagnostic,
  createCliInvocationParser,
  defineCli,
  findCliCommandForArgv
} from '../../dist/index.js';

const program = defineCli({
  name: 'ship',
  options: [{ name: 'verbose', flags: ['-v', '--verbose'], valueMode: 'none' }],
  commands: [{
    name: 'deploy',
    aliases: [{ name: 'd', deprecated: 'Use deploy.' }],
    options: [{ name: 'region', flags: ['-r', '--region'], valueMode: 'required', valueLabel: 'region' }],
    positionals: [{ name: 'service' }, { name: 'targets', required: false, variadic: true }],
    acceptsAfterDoubleDash: true
  }]
});

test('the invocation parser routes aliases around global options and binds successful values', () => {
  const parser = createCliInvocationParser(({ argv, argvIndexes, options }) => {
    assert.deepEqual(options.map((option) => option.name), ['verbose', 'region']);
    assert.deepEqual(argvIndexes, [0, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(argv, ['-v', '--region', 'eu', 'api', 'one', 'two', '--', '--watch']);
    return {
      status: 'bound',
      values: { verbose: true, region: 'eu' },
      specified: { verbose: true, region: true },
      positionals: ['api', 'one', 'two'],
      afterDoubleDash: ['--watch'],
      unknownFlags: []
    };
  });
  const result = parser.parse(program, {
    argv: ['-v', 'd', '--region', 'eu', 'api', 'one', 'two', '--', '--watch']
  });

  assert.equal(result.status, 'parsed');
  assert.equal(result.command.key, 'ship deploy');
  assert.equal(result.usedAlias?.token, 'd');
  assert.equal(result.optionValues.region, 'eu');
  assert.deepEqual(result.positionalValues, { service: 'api', targets: ['one', 'two'] });
  assert.deepEqual(result.afterDoubleDash, ['--watch']);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ['CLI_DEPRECATED_ALIAS']);
});

test('failed option binding never exposes partial values', () => {
  const parser = createCliInvocationParser(() => ({
    status: 'invalid',
    diagnostics: [createCliDiagnostic('MISSING_OPTION_VALUE', 'error', 'Missing value.')]
  }));
  const result = parser.parse(program, { argv: ['deploy', '--region'] });
  assert.equal(result.status, 'invalid');
  assert.equal('optionValues' in result, false);
  assert.equal(result.diagnostics[0].code, 'MISSING_OPTION_VALUE');
});

test('routing skips separate and attached values of global flags', () => {
  const routedProgram = defineCli({
    name: 'ship',
    options: [
      { name: 'verbose', flags: ['-v'], valueMode: 'none' },
      { name: 'config', flags: ['-c', '--config'], valueMode: 'required' },
      { name: 'color', flags: ['--color'], valueMode: 'optional-inline' }
    ],
    commands: [{ name: 'deploy' }]
  });
  const cases = [
    { argv: ['--config', 'file.json', 'deploy'], binderArgv: ['--config', 'file.json'], indexes: [0, 1] },
    { argv: ['--config=file.json', 'deploy'], binderArgv: ['--config=file.json'], indexes: [0] },
    { argv: ['-cfile.json', 'deploy'], binderArgv: ['-cfile.json'], indexes: [0] },
    { argv: ['-vc', 'file.json', 'deploy'], binderArgv: ['-vc', 'file.json'], indexes: [0, 1] },
    { argv: ['--color', 'deploy'], binderArgv: ['--color'], indexes: [0] }
  ];

  for (const expected of cases) {
    const parser = createCliInvocationParser(({ command, argv, argvIndexes }) => {
      assert.equal(command.key, 'ship deploy');
      assert.deepEqual(argv, expected.binderArgv);
      assert.deepEqual(argvIndexes, expected.indexes);
      return {
        status: 'bound',
        values: {},
        specified: {},
        positionals: [],
        afterDoubleDash: [],
        unknownFlags: []
      };
    });
    assert.equal(parser.parse(routedProgram, { argv: expected.argv }).status, 'parsed');
  }
});

test('argv-prefix routing shares invocation rules without requiring a complete parse', () => {
  const routedProgram = defineCli({
    name: 'ship',
    options: [
      { name: 'verbose', flags: ['-v'], valueMode: 'none' },
      { name: 'config', flags: ['--config'], valueMode: 'required' }
    ],
    commands: [{ name: 'deploy', aliases: ['d'] }]
  });

  assert.equal(findCliCommandForArgv(routedProgram, ['-v', 'deploy']).key, 'ship deploy');
  assert.equal(findCliCommandForArgv(routedProgram, ['--config', 'file.json', 'd']).key, 'ship deploy');
  assert.equal(findCliCommandForArgv(routedProgram, ['--config']).key, 'ship');
  assert.equal(findCliCommandForArgv(routedProgram, ['--', 'deploy']).key, 'ship');
});

test('unknown flags are errors or collected according to explicit policy', () => {
  const parser = createCliInvocationParser(() => ({
    status: 'bound',
    values: {},
    specified: {},
    positionals: ['api'],
    afterDoubleDash: [],
    unknownFlags: [{ argvElement: '--wat', flag: '--wat', argvIndex: 1 }]
  }));

  const rejected = parser.parse(program, { argv: ['deploy', '--wat', 'api'] });
  assert.equal(rejected.status, 'invalid');
  assert.equal(rejected.diagnostics.some((diagnostic) => diagnostic.code === 'CLI_UNKNOWN_FLAG'), true);

  const collected = parser.parse(program, {
    argv: ['deploy', '--wat', 'api'],
    unknownFlagPolicy: 'collect'
  });
  assert.equal(collected.status, 'parsed');
  assert.equal(collected.unknownFlags[0].argvIndex, 1);
});

test('unknown commands, positional mistakes, and undeclared post-boundary tokens are rejected', () => {
  const binder = createCliInvocationParser(({ argv }) => ({
    status: 'bound',
    values: {},
    specified: {},
    positionals: argv.filter((token) => token !== '--'),
    afterDoubleDash: argv.includes('--') ? ['tail'] : [],
    unknownFlags: []
  }));

  assert.equal(binder.parse(program, { argv: ['unknown'] }).diagnostics[0].code, 'CLI_UNKNOWN_COMMAND');
  assert.equal(binder.parse(program, { argv: ['deploy'] }).diagnostics[0].code, 'CLI_MISSING_POSITIONAL');
  assert.equal(binder.parse(program, { argv: ['deploy', 'api', 'one', 'two'] }).status, 'parsed');

  const noTail = defineCli({ name: 'ship', commands: [{ name: 'status' }] });
  const tailResult = binder.parse(noTail, { argv: ['status', '--'] });
  assert.equal(tailResult.status, 'invalid');
  assert.equal(tailResult.diagnostics[0].code, 'CLI_AFTER_DOUBLE_DASH_NOT_ACCEPTED');
});
