import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCliInvocation,
  createCliInvocationParser,
  createCliOptionDiagnostic,
  defineCli
} from '../../dist/index.js';

const program = defineCli({
  name: 'ship',
  options: [{ name: 'verbose', kind: 'boolean', flags: ['-v', '--verbose'] }],
  commands: [{
    name: 'project',
    options: [{ name: 'config', kind: 'value', flags: ['--config'], valueMode: 'required' }],
    commands: [{
      name: 'deploy',
      aliases: [{ name: 'd', deprecated: 'Use deploy.' }],
      deprecated: 'Use release.',
      options: [{
        name: 'region',
        kind: 'value',
        flags: ['-r', '--region'],
        valueMode: 'required',
        required: true,
        valueCandidates: ['eu', 'us']
      }],
      positionals: [{ name: '__proto__' }, { name: 'targets', required: false, variadic: true }],
      acceptsPassthroughArguments: true
    }]
  }]
});

function parserFor({ scan, bind }) {
  return createCliInvocationParser({ scan, bind });
}

test('routing consumes only binder-classified arguments and preserves every alias use', () => {
  const parser = parserFor({
    scan({ command }) {
      assert.deepEqual(
        command.options.map((option) => option.name),
        command.key === 'ship'
          ? ['verbose']
          : command.key === 'ship project'
            ? ['verbose', 'config']
            : ['verbose', 'config', 'region']
      );
      return {
        status: 'scanned',
        options: [
          { option: 'verbose', flag: '-v', argvElement: '-v', argvIndex: 0 },
          ...(command.key === 'ship' ? [] : [{
            option: 'config',
            flag: '--config',
            argvElement: '--config',
            argvIndex: 2,
            rawValue: 'file',
            valueArgvIndex: 3,
            inline: false
          }]),
          ...(command.key === 'ship project deploy' ? [{
            option: 'region',
            flag: '--region',
            argvElement: '--region',
            argvIndex: 5,
            rawValue: 'eu',
            valueArgvIndex: 6,
            inline: false
          }] : [])
        ],
        arguments: command.key === 'ship'
          ? [
              { value: 'project', argvIndex: 1 },
              { value: 'file', argvIndex: 3 },
              { value: 'd', argvIndex: 4 },
              { value: 'eu', argvIndex: 6 },
              { value: 'api', argvIndex: 7 },
              { value: 'one', argvIndex: 8 }
            ]
          : command.key === 'ship project'
            ? [
                { value: 'project', argvIndex: 1 },
                { value: 'd', argvIndex: 4 },
                { value: 'eu', argvIndex: 6 },
                { value: 'api', argvIndex: 7 },
                { value: 'one', argvIndex: 8 }
              ]
            : [
                { value: 'project', argvIndex: 1 },
                { value: 'd', argvIndex: 4 },
                { value: 'api', argvIndex: 7 },
                { value: 'one', argvIndex: 8 }
              ],
        afterDoubleDash: [{ value: '--watch', argvIndex: 10 }],
        doubleDashArgvIndex: 9,
        unknownFlags: [
          ...(command.key === 'ship'
            ? [
                { argvElement: '--config', flag: '--config', argvIndex: 2 },
                { argvElement: '--region', flag: '--region', argvIndex: 5 }
              ]
            : command.key === 'ship project'
              ? [{ argvElement: '--region', flag: '--region', argvIndex: 5 }]
              : [])
        ]
      };
    },
    bind({ argv, argvIndexes, options }) {
      assert.deepEqual(argvIndexes, [0, 2, 3, 5, 6, 7, 8, 9, 10]);
      assert.deepEqual(argv, ['-v', '--config', 'file', '--region', 'eu', 'api', 'one', '--', '--watch']);
      assert.deepEqual(options.map((option) => option.name), ['verbose', 'config', 'region']);
      return {
        status: 'bound',
        values: { verbose: true, config: 'file', region: 'eu' },
        specified: { verbose: true, config: true, region: true },
        positionals: ['api', 'one'],
        afterDoubleDash: ['--watch'],
        unknownFlags: []
      };
    }
  });
  const result = parser.parse(program, {
    argv: ['-v', 'project', '--config', 'file', 'd', '--region', 'eu', 'api', 'one', '--', '--watch']
  });

  assert.equal(result.status, 'ready');
  assert.deepEqual(result.source, {
    kind: 'argv',
    argv: ['-v', 'project', '--config', 'file', 'd', '--region', 'eu', 'api', 'one', '--', '--watch']
  });
  assert.equal(result.command.key, 'ship project deploy');
  assert.deepEqual(result.usedAliases.map((alias) => alias.token), ['d']);
  assert.deepEqual(Object.entries(result.positionalValues), [
    ['__proto__', 'api'],
    ['targets', ['one']]
  ]);
  assert.equal(Object.getPrototypeOf(result.positionalValues), null);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    'CLI_DEPRECATED_ALIAS',
    'CLI_DEPRECATED_COMMAND'
  ]);
});

test('unknown options before a child command fail before routing regardless of value form', () => {
  const parser = parserFor({
    scan({ command, argv }) {
      if (command.key === 'ship') {
        const attached = argv[0]?.includes('=') === true;
        return {
          status: 'scanned',
          options: [],
          arguments: attached
            ? [{ value: 'project', argvIndex: 1 }]
            : [{ value: 'eu', argvIndex: 1 }, { value: 'project', argvIndex: 2 }],
          afterDoubleDash: [],
          unknownFlags: [{ argvElement: argv[0], flag: '--region', argvIndex: 0 }]
        };
      }
      throw new Error('routing must stop at the unknown option');
    },
    bind() {
      throw new Error('binding must not run');
    }
  });

  for (const argv of [
    ['--region=eu', 'project'],
    ['--region', 'eu', 'project']
  ]) {
    const result = parser.parse(program, { argv });
    assert.equal(result.status, 'invalid');
    assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ['CLI_UNKNOWN_FLAG']);
  }
});

test('malformed binder output is rejected before invocation construction', () => {
  const parser = parserFor({
    scan() {
      return {
        status: 'scanned',
        options: [],
        arguments: [],
        afterDoubleDash: [],
        unknownFlags: []
      };
    },
    bind() {
      return {
        status: 'bound',
        values: { nonexistent: true },
        specified: {},
        positionals: [],
        afterDoubleDash: [],
        unknownFlags: []
      };
    }
  });
  const result = parser.parse(program);
  assert.equal(result.status, 'invalid');
  assert.equal(result.diagnostics[0].code, 'CLI_INVALID_BINDER_RESULT');

  const sparseArguments = [];
  sparseArguments.length = 1;
  const sparseParser = parserFor({
    scan() {
      return {
        status: 'scanned',
        options: [],
        arguments: sparseArguments,
        afterDoubleDash: [],
        unknownFlags: []
      };
    },
    bind() {
      throw new Error('binding must not run after a malformed scan');
    }
  });
  const sparseResult = sparseParser.parse(program, { argv: ['value'] });
  assert.equal(sparseResult.status, 'invalid');
  assert.equal(sparseResult.diagnostics[0]?.code, 'CLI_INVALID_BINDER_RESULT');
});

test('scan results form an ordered exclusive argv partition', () => {
  const scanProgram = defineCli({
    name: 'scan',
    options: [
      { name: 'verbose', kind: 'boolean', flags: ['-v'] },
      { name: 'output', kind: 'value', flags: ['-o'], valueMode: 'required' }
    ]
  });
  const cases = [
    {
      argv: ['second', 'first'],
      scan: {
        status: 'scanned',
        options: [],
        arguments: [
          { value: 'first', argvIndex: 1 },
          { value: 'second', argvIndex: 0 }
        ],
        afterDoubleDash: [],
        unknownFlags: []
      }
    },
    {
      argv: ['-v'],
      scan: {
        status: 'scanned',
        options: [{ option: 'verbose', flag: '-v', argvElement: '-v', argvIndex: 0 }],
        arguments: [{ value: '-v', argvIndex: 0 }],
        afterDoubleDash: [],
        unknownFlags: []
      }
    },
    {
      argv: ['-o', 'file'],
      scan: {
        status: 'scanned',
        options: [{
          option: 'output',
          flag: '-o',
          argvElement: '-o',
          argvIndex: 0,
          rawValue: 'file',
          valueArgvIndex: 1,
          inline: false
        }],
        arguments: [{ value: 'file', argvIndex: 1 }],
        afterDoubleDash: [],
        unknownFlags: []
      }
    },
    {
      argv: ['-o', 'file'],
      scan: {
        status: 'scanned',
        options: [{
          option: 'output',
          flag: '-o',
          argvElement: '-o',
          argvIndex: 0,
          valueArgvIndex: 1
        }],
        arguments: [],
        afterDoubleDash: [],
        unknownFlags: []
      }
    },
    {
      argv: ['--', 'tail'],
      scan: {
        status: 'scanned',
        options: [],
        arguments: [{ value: '--', argvIndex: 0 }, { value: 'tail', argvIndex: 1 }],
        afterDoubleDash: [],
        unknownFlags: []
      }
    },
    {
      argv: ['-v'],
      scan: {
        status: 'scanned',
        options: [{ option: 'verbose', flag: '-v', argvElement: '-v', argvIndex: 0, offset: 0 }],
        arguments: [],
        afterDoubleDash: [],
        unknownFlags: []
      }
    },
    {
      argv: ['-ov'],
      scan: {
        status: 'scanned',
        options: [
          {
            option: 'output',
            flag: '-o',
            argvElement: '-ov',
            argvIndex: 0,
            offset: 1,
            rawValue: 'v',
            valueArgvIndex: 0,
            inline: true
          },
          { option: 'verbose', flag: '-v', argvElement: '-ov', argvIndex: 0, offset: 2 }
        ],
        arguments: [],
        afterDoubleDash: [],
        unknownFlags: []
      }
    }
  ];

  for (const entry of cases) {
    const parser = parserFor({
      scan: () => entry.scan,
      bind() {
        throw new Error('binding must not run after an incoherent scan');
      }
    });
    const result = parser.parse(scanProgram, { argv: entry.argv });
    assert.equal(result.status, 'invalid');
    assert.equal(result.diagnostics[0]?.code, 'CLI_INVALID_BINDER_RESULT');
  }
});

test('recognized and unknown short-cluster members share one option token by offset', () => {
  const clusterProgram = defineCli({
    name: 'cluster',
    options: [
      { name: 'alpha', kind: 'boolean', flags: ['-a'] },
      { name: 'beta', kind: 'boolean', flags: ['-b'] }
    ]
  });
  const unknown = { argvElement: '-abx', flag: '-x', argvIndex: 0, offset: 3 };
  const parser = parserFor({
    scan: () => ({
      status: 'scanned',
      options: [
        { option: 'alpha', flag: '-a', argvElement: '-abx', argvIndex: 0, offset: 1 },
        { option: 'beta', flag: '-b', argvElement: '-abx', argvIndex: 0, offset: 2 }
      ],
      arguments: [],
      afterDoubleDash: [],
      unknownFlags: [unknown]
    }),
    bind: () => ({
      status: 'bound',
      values: { alpha: true, beta: true },
      specified: { alpha: true, beta: true },
      positionals: [],
      afterDoubleDash: [],
      unknownFlags: [unknown]
    })
  });
  const result = parser.parse(clusterProgram, {
    argv: ['-abx'],
    unknownFlagPolicy: 'collect'
  });
  assert.equal(result.status, 'ready');
});

test('binding presence must match scanned option names', () => {
  const presenceProgram = defineCli({
    name: 'presence',
    options: [
      { name: 'alpha', kind: 'boolean', flags: ['-a'] },
      { name: 'beta', kind: 'boolean', flags: ['-b'] }
    ]
  });
  const parser = parserFor({
    scan: () => ({
      status: 'scanned',
      options: [{ option: 'alpha', flag: '-a', argvElement: '-a', argvIndex: 0 }],
      arguments: [],
      afterDoubleDash: [],
      unknownFlags: []
    }),
    bind: () => ({
      status: 'bound',
      values: { beta: true },
      specified: { alpha: false, beta: true },
      positionals: [],
      afterDoubleDash: [],
      unknownFlags: []
    })
  });
  const result = parser.parse(presenceProgram, { argv: ['-a'] });
  assert.equal(result.status, 'invalid');
  assert.match(result.diagnostics[0]?.reason, /specified options/u);
});

test('failed option binding preserves unknown flags without partial values', () => {
  const parser = parserFor({
    scan() {
      return {
        status: 'scanned',
        options: [],
        arguments: [],
        afterDoubleDash: [],
        unknownFlags: [{ argvElement: '--wat', flag: '--wat', argvIndex: 0 }]
      };
    },
    bind() {
      return {
        status: 'invalid',
        diagnostics: [createCliOptionDiagnostic('MISSING_OPTION_VALUE', 'error', 'Missing value.')],
        unknownFlags: [{ argvElement: '--wat', flag: '--wat', argvIndex: 0 }]
      };
    }
  });
  const result = parser.parse(program, { argv: ['--wat'] });
  assert.equal(result.status, 'invalid');
  assert.equal('optionValues' in result, false);
  assert.deepEqual(result.unknownFlags, [{ argvElement: '--wat', flag: '--wat', argvIndex: 0 }]);
});

test('structured invocations validate option and positional correspondence', () => {
  const valid = createCliInvocation(program, {
    sourceId: 'test',
    commandPath: ['project', 'deploy'],
    optionValues: { region: 'eu' },
    specifiedOptions: { verbose: false, config: false, region: true },
    positionalValues: Object.fromEntries([['__proto__', 'api'], ['targets', []]])
  });
  assert.equal(valid.status, 'ready');
  assert.equal(valid.command.key, 'ship project deploy');
  assert.deepEqual(valid.source, { kind: 'structured', sourceId: 'test' });

  const invalid = createCliInvocation(program, {
    commandPath: ['project', 'deploy'],
    optionValues: { typo: true },
    specifiedOptions: { verbose: false, config: false, region: false },
    positionalValues: Object.fromEntries([['__proto__', 'api'], ['targets', []]])
  });
  assert.equal(invalid.status, 'invalid');
  assert.equal(invalid.diagnostics[0].code, 'CLI_INVALID_STRUCTURED_INVOCATION');

  const missingRequiredOccurrence = createCliInvocation(program, {
    commandPath: ['project', 'deploy'],
    optionValues: { region: 'eu' },
    specifiedOptions: { verbose: false, config: false, region: false },
    positionalValues: Object.fromEntries([['__proto__', 'api'], ['targets', []]])
  });
  assert.equal(missingRequiredOccurrence.status, 'invalid');
  assert.match(missingRequiredOccurrence.diagnostics[0]?.reason, /must be specified/u);

  let reads = 0;
  const accessorInput = {
    commandPath: ['project', 'deploy'],
    optionValues: { region: 'eu' },
    specifiedOptions: { verbose: false, config: false, region: true },
    positionalValues: Object.fromEntries([['__proto__', 'api'], ['targets', []]])
  };
  Object.defineProperty(accessorInput, 'sourceId', {
    get() {
      reads += 1;
      return 'unsafe';
    }
  });
  const accessorResult = createCliInvocation(program, accessorInput);
  assert.equal(accessorResult.status, 'invalid');
  assert.equal(accessorResult.diagnostics[0]?.code, 'CLI_INVALID_STRUCTURED_INVOCATION');
  assert.equal(reads, 0);

  const unknownProperty = createCliInvocation(program, {
    commandPath: ['project', 'deploy'],
    optionValues: { region: 'eu' },
    specifiedOptions: { verbose: false, config: false, region: true },
    positionalValues: Object.fromEntries([['__proto__', 'api'], ['targets', []]]),
    unsupported: true
  });
  assert.equal(unknownProperty.status, 'invalid');
  assert.equal(unknownProperty.diagnostics[0]?.code, 'CLI_INVALID_STRUCTURED_INVOCATION');
});

test('root inputs and non-invokable command groups are modeled directly', () => {
  const rootProgram = defineCli({
    name: 'format',
    positionals: [{ name: 'file' }],
    acceptsPassthroughArguments: true
  });
  const rootParser = parserFor({
    scan: () => ({
      status: 'scanned',
      options: [],
      arguments: [{ value: 'input.ts', argvIndex: 0 }],
      afterDoubleDash: [{ value: '--check', argvIndex: 2 }],
      doubleDashArgvIndex: 1,
      unknownFlags: []
    }),
    bind: () => ({
      status: 'bound',
      values: {},
      specified: {},
      positionals: ['input.ts'],
      afterDoubleDash: ['--check'],
      unknownFlags: []
    })
  });
  const root = rootParser.parse(rootProgram, { argv: ['input.ts', '--', '--check'] });
  assert.equal(root.status, 'ready');
  assert.deepEqual(Object.entries(root.positionalValues), [['file', 'input.ts']]);
  assert.deepEqual(root.passthroughArguments, ['--check']);

  const groupedProgram = defineCli({
    name: 'tool',
    invokable: false,
    commands: [{ name: 'deploy' }]
  });
  const groupedParser = parserFor({
    scan: ({ argv }) => ({
      status: 'scanned',
      options: [],
      arguments: argv.map((value, argvIndex) => ({ value, argvIndex })),
      afterDoubleDash: [],
      unknownFlags: []
    }),
    bind: () => ({
      status: 'bound',
      values: {},
      specified: {},
      positionals: [],
      afterDoubleDash: [],
      unknownFlags: []
    })
  });
  const missingChild = groupedParser.parse(groupedProgram);
  assert.equal(missingChild.status, 'invalid');
  assert.equal(missingChild.diagnostics[0]?.code, 'CLI_SUBCOMMAND_REQUIRED');
  assert.equal(groupedParser.parse(groupedProgram, { argv: ['deploy'] }).status, 'ready');
});
