import assert from 'node:assert/strict';
import test from 'node:test';
import { createCliInvocation, createCliInvocationParser, createCliOptionDiagnostic, defineCli } from '../../dist/index.js';

const step = (nextIndex, fields = {}) => ({ nextIndex, options: [], controlOptions: [], arguments: [], controls: [], afterDoubleDash: [], unknownFlags: [], unclassified: [], diagnostics: [], ...fields });
const arg = (value, argvIndex) => ({ value, argvIndex });
const occurrence = (option, flag, argvIndex, fields = {}) => ({ option, flag, argvElement: flag, argvIndex, ...fields });
const bound = (values = {}, specified = {}) => ({ status: 'bound', values, specified });
const error = (code = 'VALUE_ERROR') => createCliOptionDiagnostic(code, 'error', code);
function scripted(steps, bind = () => bound()) {
  return createCliInvocationParser({ create: () => {
    let cursor = 0;
    return { next(scope) { const entry = steps[cursor++]; return typeof entry === 'function' ? entry(scope) : entry; }, bind };
  } });
}
const program = defineCli({ name: 'ship', options: [{ name: 'verbose', kind: 'boolean', flags: ['-v'] }], commands: [{
  name: 'project', options: [{ name: 'config', kind: 'value', flags: ['--config'], valueMode: 'required' }], commands: [{
    name: 'deploy', aliases: [{ name: 'd', deprecated: 'Use deploy.' }], deprecated: 'Use release.',
    options: [{ name: 'region', kind: 'value', flags: ['--region'], valueMode: 'required', required: true }],
    positionals: [{ name: '__proto__' }, { name: 'targets', required: false, variadic: true }], acceptsPassthroughArguments: true
  }]
}] });

test('cursor routing changes scope once per command and retains exact ownership', () => {
  const scopes = [];
  const steps = [
    step(1, { options: [occurrence('verbose', '-v', 0)] }), step(2, { arguments: [arg('project', 1)] }),
    step(4, { options: [occurrence('config', '--config', 2, { rawValue: 'file', valueArgvIndex: 3, inline: false })] }),
    step(5, { arguments: [arg('d', 4)] }), step(7, { options: [occurrence('region', '--region', 5, { rawValue: 'eu', valueArgvIndex: 6, inline: false })] }),
    step(8, { arguments: [arg('api', 7)] }), step(9, { arguments: [arg('one', 8)] }),
    step(11, { doubleDashArgvIndex: 9, afterDoubleDash: [arg('--watch', 10)] })
  ].map((entry) => (scope) => { scopes.push(scope.key); return entry; });
  let decodes = 0;
  const parser = scripted(steps, () => { decodes++; return bound({ verbose: true, config: 'file', region: 'eu' }, { verbose: true, config: true, region: true }); });
  const route = parser.route(program, { argv: ['-v', 'project', '--config', 'file', 'd', '--region', 'eu', 'api', 'one', '--', '--watch'] });
  assert.equal(decodes, 0);
  assert.deepEqual(scopes, ['ship', 'ship', 'ship project', 'ship project', 'ship project deploy', 'ship project deploy', 'ship project deploy', 'ship project deploy']);
  assert.deepEqual(route.commandIndexes, [1, 4]);
  assert.equal(route.classification.options.length, 3);
  const result = parser.bind(route);
  assert.equal(result.status, 'ready');
  assert.equal(result.commandKey, 'ship project deploy');
  assert.deepEqual(result.positionals, ['api', 'one']);
  assert.deepEqual(Object.entries(result.positionalValues), [['__proto__', 'api'], ['targets', ['one']]]);
  assert.equal(Object.getPrototypeOf(result.positionalValues), null);
  assert.deepEqual(result.passthroughArguments, ['--watch']);
  assert.deepEqual(result.diagnostics.map(({ code }) => code), ['CLI_DEPRECATED_ALIAS', 'CLI_DEPRECATED_COMMAND']);
  assert.equal(parser.bind(route), result);
  parser.bind(route, { unknownFlagPolicy: 'collect' });
  assert.equal(decodes, 1);
  assert.throws(() => scripted([]).bind(route), /not owned/u);
});

test('classified lexical errors preserve command scope and consumed control-like values', () => {
  const p = defineCli({ name: 'tool', options: [{ name: 'progress', kind: 'value', flags: ['--progress'], valueMode: 'required' }], commands: [{ name: 'query', options: [{ name: 'term', kind: 'value', flags: ['--term'], valueMode: 'required' }] }] });
  const parser = scripted([
    step(1, { arguments: [arg('query', 0)] }),
    step(3, { options: [occurrence('term', '--term', 1, { rawValue: '--help', valueArgvIndex: 2, inline: false })] }),
    step(4, { options: [occurrence('progress', '--progress', 3)], diagnostics: [error('MISSING_OPTION_VALUE')] })
  ], () => ({ status: 'invalid', diagnostics: [error('MISSING_OPTION_VALUE')] }));
  const route = parser.route(p, { argv: ['query', '--term', '--help', '--progress'] });
  assert.equal(route.status, 'routed');
  assert.deepEqual(route.command.path, ['query']);
  assert.equal(route.classification.options[0].rawValue, '--help');
  const result = parser.bind(route);
  assert.equal(result.status, 'invalid');
  assert.equal('optionValues' in result, false);
});

test('unknown flags before children and uncertain syntax never guess commands', () => {
  const p = defineCli({ name: 'tool', commands: [{ name: 'run' }] });
  for (const first of [
    step(1, { unknownFlags: [{ flag: '--local', argvElement: '--local', argvIndex: 0 }] }),
    step(1, { unclassified: [arg('--local', 0)], diagnostics: [error('INVALID_FLAG_SYNTAX')] })
  ]) {
    const parser = scripted([first, step(2, { arguments: [arg('run', 1)] })], () => { throw new Error('must not decode blocked route'); });
    const result = parser.parse(p, { argv: ['--local', 'run'], unknownFlagPolicy: 'collect' });
    assert.equal(result.status, 'invalid');
    assert.deepEqual(result.command.path, []);
  }
});

test('unknown flags on leaves follow collection policy without redecoding', () => {
  const p = defineCli({ name: 'tool' });
  let calls = 0;
  const parser = scripted([step(1, { unknownFlags: [{ flag: '--wat', argvElement: '--wat', argvIndex: 0 }] })], () => { calls++; return bound(); });
  const route = parser.route(p, { argv: ['--wat'] });
  assert.equal(parser.bind(route).status, 'invalid');
  assert.equal(parser.bind(route, { unknownFlagPolicy: 'collect' }).status, 'ready');
  assert.equal(calls, 1);
});

test('malformed spans reject gaps, overlaps, invalid values and non-progress', () => {
  const p = defineCli({ name: 'tool' });
  for (const invalid of [
    null, step(0), step(2), step(1), step(1, { arguments: [arg('wrong', 0)] }),
    step(1, { arguments: [arg('x', 0), arg('x', 0)] }),
    step(1, { options: [occurrence('x', 'x', 0), occurrence('x', 'x', 0)] }),
    step(1, { options: [occurrence('x', 'x', 0, { rawValue: 'x' })] }),
    step(1, { unclassified: [arg('x', 0)] })
  ]) {
    const result = scripted([invalid]).parse(p, { argv: ['x'] });
    assert.equal(result.status, 'invalid');
    assert.equal(result.diagnostics[0].code, 'CLI_INVALID_BINDER_RESULT');
  }
});

test('cluster member source ownership is retained without duplicate whole-token ownership', () => {
  const p = defineCli({ name: 'tool', options: [{ name: 'a', kind: 'boolean', flags: ['-a'] }] });
  const parser = scripted([step(1, { options: [occurrence('a', '-a', 0, { argvElement: '-az', offset: 1 })], unknownFlags: [{ argvElement: '-az', flag: '-z', argvIndex: 0, offset: 2 }] })], () => bound({ a: true }, { a: true }));
  assert.equal(parser.parse(p, { argv: ['-az'], unknownFlagPolicy: 'collect' }).status, 'ready');
});

test('scan records are owned snapshots before subsequent decoder callbacks', () => {
  const p = defineCli({ name: 'tool', positionals: [{ name: 'file' }] });
  const argument = arg('original', 0);
  const parser = scripted([step(1, { arguments: [argument] })], () => { argument.value = 'changed'; return bound(); });
  const result = parser.parse(p, { argv: ['original'] });
  assert.equal(result.status, 'ready');
  assert.equal(result.positionalValues.file, 'original');
});

test('non-enumerable accepted records retain value and presence', () => {
  const p = defineCli({ name: 'tool', options: [{ name: 'on', kind: 'boolean', flags: ['--on'], required: true }] });
  const record = Object.defineProperty({}, 'on', { value: true });
  const option = Object.fromEntries([]);
  for (const [key, value] of Object.entries(occurrence('on', '--on', 0))) Object.defineProperty(option, key, { value });
  const parser = scripted([step(1, { options: [option] })], () => bound(record, record));
  const result = parser.parse(p, { argv: ['--on'] });
  assert.equal(result.status, 'ready');
  assert.equal(result.optionValues.on, true);
  assert.equal(result.specifiedOptions.on, true);
});

test('binding rejects malformed records, unknown names, absent required values and unexplained failure', () => {
  const p = defineCli({ name: 'tool', options: [{ name: 'on', kind: 'boolean', flags: ['--on'], required: true }] });
  for (const binding of [null, bound(), bound({}, { on: true }), bound({ on: true }, { on: false }), bound({ on: true, typo: 1 }, { on: true }), { status: 'invalid', diagnostics: [] }]) {
    const result = scripted([step(1, { options: [occurrence('on', '--on', 0)] })], () => binding).parse(p, { argv: ['--on'] });
    assert.equal(result.status, 'invalid');
    assert.equal(result.diagnostics[0].code, 'CLI_INVALID_BINDER_RESULT');
  }
});

test('false deprecation is normalized for commands and aliases', () => {
  const p = defineCli({ name: 'tool', commands: [{ name: 'run', deprecated: false, aliases: [{ name: 'r', deprecated: false }] }] });
  assert.equal('deprecated' in p.commands[1], false);
  assert.equal('deprecated' in p.commands[1].aliases[0], false);
  const parser = scripted([step(1, { arguments: [arg('r', 0)] })]);
  assert.deepEqual(parser.parse(p, { argv: ['r'] }).diagnostics, []);
  assert.deepEqual(createCliInvocation(p, { commandPath: ['run'], optionValues: {}, specifiedOptions: {}, positionalValues: {} }).diagnostics, []);
});

test('root inputs, passthrough, unknown commands and grouping commands retain semantics', () => {
  const p = defineCli({ name: 'tool', positionals: [{ name: 'file' }], acceptsPassthroughArguments: true });
  const parser = scripted([step(1, { arguments: [arg('file', 0)] }), step(3, { doubleDashArgvIndex: 1, afterDoubleDash: [arg('--x', 2)] })]);
  const result = parser.parse(p, { argv: ['file', '--', '--x'] });
  assert.equal(result.status, 'ready'); assert.deepEqual(result.passthroughArguments, ['--x']);
  const group = defineCli({ name: 'tool', invokable: false, commands: [{ name: 'run' }] });
  assert.equal(scripted([]).parse(group).diagnostics[0].code, 'CLI_SUBCOMMAND_REQUIRED');
  assert.equal(scripted([step(1, { arguments: [arg('typo', 0)] })]).parse(group, { argv: ['typo'] }).diagnostics[0].code, 'CLI_UNKNOWN_COMMAND');
});

test('classification work grows by one cursor step per positional, independent of input length', () => {
  const p = defineCli({ name: 'tool', positionals: [{ name: 'files', variadic: true }] });
  for (const size of [100, 1000, 10000]) {
    let calls = 0;
    const parser = createCliInvocationParser({ create: (argv) => ({
      next: () => { const index = calls++; return step(index + 1, { arguments: [arg(argv[index], index)] }); },
      bind: () => bound()
    }) });
    assert.equal(parser.parse(p, { argv: Array(size).fill('file') }).status, 'ready');
    assert.equal(calls, size);
  }
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


test('integration control arguments retain ownership without entering the command model', () => {
  const p = defineCli({ name: 'tool', invokable: false, commands: [{ name: 'run' }] });
  const parser = scripted([step(1, { controls: [arg('help', 0)] }), step(2, { arguments: [arg('run', 1)] })]);
  const route = parser.route(p, { argv: ['help', 'run'] });
  assert.equal(route.status, 'routed');
  assert.deepEqual(route.command.path, ['run']);
  assert.deepEqual(route.classification.controls, [arg('help', 0)]);
  assert.deepEqual(parser.bind(route).positionals, []);
});

test('argv and structured arrays reject custom iteration before callbacks', () => {
  let called = false;
  const parser = createCliInvocationParser({ create() { called = true; throw new Error('unexpected'); } });
  const argv = [];
  argv[Symbol.iterator] = function* () { yield 7; };
  assert.throws(() => parser.route(defineCli({ name: 'tool' }), { argv }), /dense string array/u);
  assert.equal(called, false);
  const p = defineCli({ name: 'tool', positionals: [{ name: 'files', variadic: true, required: false }] });
  const result = createCliInvocation(p, { optionValues: {}, specifiedOptions: {}, positionalValues: { files: argv } });
  assert.equal(result.status, 'invalid');
});

test('diagnostics and binding cache own data once even across policy changes', () => {
  const p = defineCli({ name: 'tool' });
  const diagnostic = { source: 'option', code: 'ERROR', severity: 'error', message: 'original', details: { nested: ['original'] } };
  let calls = 0;
  const parser = scripted([], () => { calls++; return { status: 'invalid', diagnostics: [diagnostic] }; });
  const route = parser.route(p);
  const result = parser.bind(route);
  diagnostic.message = 'changed'; diagnostic.details.nested = ['changed'];
  assert.equal(result.diagnostics[0].message, 'original');
  assert.equal(result.diagnostics[0].details.nested[0], 'original');
  assert.equal(parser.bind(route, { unknownFlagPolicy: 'collect' }).diagnostics[0].message, 'original');
  assert.equal(calls, 1);
  let invalidCalls = 0;
  const invalidParser = scripted([], () => { invalidCalls++; return null; });
  const invalidRoute = invalidParser.route(p);
  invalidParser.bind(invalidRoute); invalidParser.bind(invalidRoute, { unknownFlagPolicy: 'collect' });
  assert.equal(invalidCalls, 1);
});

test('domain occurrences cannot precede their declaring command while controls stay separate', () => {
  const p = defineCli({ name: 'tool', commands: [{ name: 'run', options: [{ name: 'x', kind: 'boolean', flags: ['-x'] }] }] });
  const parser = scripted([step(1, { options: [occurrence('x', '-x', 0)] }), step(2, { arguments: [arg('run', 1)] })], () => bound({ x: true }, { x: true }));
  assert.equal(parser.parse(p, { argv: ['-x', 'run'] }).diagnostics[0].code, 'CLI_INVALID_BINDER_RESULT');
  const controlParser = scripted([step(1, { controlOptions: [occurrence('help', '--help', 0)] })]);
  const route = controlParser.route(p, { argv: ['--help'] });
  assert.equal(route.classification.controlOptions[0].option, 'help');
  assert.deepEqual(p.root.options, []);
});

test('route owns the exact argv snapshot handed to its grammar session', () => {
  let supplied;
  const parser = createCliInvocationParser({ create(argv) { supplied = argv; return { next() { throw new Error('empty'); }, bind: () => bound() }; } });
  const route = parser.route(defineCli({ name: 'tool' }));
  assert.equal(route.classification.argv, supplied);
  assert.equal(Object.isFrozen(supplied), true);
});

test('decoded application objects retain decoder ownership', () => {
  const value = { mutable: true };
  const p = defineCli({ name: 'tool', options: [{ name: 'config', kind: 'value', flags: ['--config'], valueMode: 'required' }] });
  const result = createCliInvocation(p, { optionValues: { config: value }, specifiedOptions: { config: true }, positionalValues: {} });
  assert.equal(result.optionValues.config, value);
  assert.equal(Object.isFrozen(value), false);
});

test('custom nested diagnostic details retain application ownership without rejecting Date or cycles', () => {
  const date = new Date(0); const cyclic = {}; cyclic.self = cyclic;
  const diagnostic = createCliOptionDiagnostic('CUSTOM', 'error', 'custom', { date, cyclic });
  assert.equal(diagnostic.details.date, date);
  assert.equal(diagnostic.details.cyclic, cyclic);
  assert.equal(Object.isFrozen(diagnostic.details), true);
  assert.equal(Object.isFrozen(cyclic), false);
  const result = scripted([], () => ({ status: 'invalid', diagnostics: [diagnostic] })).parse(defineCli({ name: 'tool' }));
  assert.equal(result.status, 'invalid');
  assert.equal(result.diagnostics[0].details.cyclic.self, cyclic);
});

test('a throwing decoder is invoked once and rethrows the original error', () => {
  const failure = new Error('decoder bug');
  let calls = 0;
  const parser = scripted([], () => { calls++; throw failure; });
  const route = parser.route(defineCli({ name: 'tool' }));
  assert.throws(() => parser.bind(route), (error) => error === failure);
  assert.throws(() => parser.bind(route, { unknownFlagPolicy: 'collect' }), (error) => error === failure);
  assert.equal(calls, 1);
});

test('unknown commands retain known global classification without selecting later children', () => {
  const p = defineCli({ name: 'tool', options: [{ name: 'json', kind: 'boolean', flags: ['--json'] }], commands: [{ name: 'run' }] });
  const parser = scripted([
    step(1, { arguments: [arg('unknown', 0)] }),
    step(2, { options: [occurrence('json', '--json', 1)] }),
    step(3, { controlOptions: [occurrence('help', '--help', 2)] }),
    step(4, { arguments: [arg('run', 3)] })
  ], () => { throw new Error('invalid route cannot decode'); });
  const route = parser.route(p, { argv: ['unknown', '--json', '--help', 'run'] });
  assert.equal(route.status, 'invalid');
  assert.equal(route.classification.complete, true);
  assert.deepEqual(route.command.path, []);
  assert.deepEqual(route.commandIndexes, []);
  assert.equal(route.classification.options[0].option, 'json');
  assert.equal(route.classification.controlOptions[0].option, 'help');
  assert.equal(parser.bind(route).status, 'invalid');
  const uncertain = scripted([
    step(1, { arguments: [arg('unknown', 0)] }),
    step(2, { unknownFlags: [{ argvElement: '--term', flag: '--term', argvIndex: 1 }] }),
    () => { throw new Error('must not guess suffix ownership'); }
  ]).route(p, { argv: ['unknown', '--term', '--json'] });
  assert.equal(uncertain.status, 'invalid');
  assert.equal(uncertain.classification.complete, false);
  assert.deepEqual(uncertain.classification.options, []);
  assert.deepEqual(uncertain.classification.unclassified, [arg('--json', 2)]);
});

test('final unknown flags on invokable parents retain collection and decode-once semantics', () => {
  for (const nested of [false, true]) {
    const p = defineCli(nested
      ? { name: 'tool', commands: [{ name: 'parent', commands: [{ name: 'run' }] }] }
      : { name: 'tool', commands: [{ name: 'run' }] });
    const prefix = nested ? ['parent'] : [];
    for (const flag of ['--extra', '--extra=value', '-x']) {
      let calls = 0;
      const unknown = { argvElement: flag, flag: flag === '--extra=value' ? '--extra' : flag, argvIndex: prefix.length,
        ...(flag === '--extra=value' ? { inlineValue: 'value' } : {}) };
      const parser = scripted([
        ...(nested ? [step(1, { arguments: [arg('parent', 0)] })] : []),
        step(prefix.length + 1, { unknownFlags: [unknown] })
      ], () => { calls++; return bound(); });
      const route = parser.route(p, { argv: [...prefix, flag] });
      assert.equal(route.status, 'routed');
      assert.equal(route.classification.complete, true);
      assert.deepEqual(route.command.path, prefix);
      assert.deepEqual(route.classification.unknownFlags, [unknown]);
      assert.deepEqual(parser.bind(route).diagnostics.map(({ code }) => code), ['CLI_UNKNOWN_FLAG']);
      const collected = parser.bind(route, { unknownFlagPolicy: 'collect' });
      assert.equal(collected.status, 'ready');
      assert.deepEqual(collected.unknownFlags, [unknown]);
      assert.deepEqual(collected.diagnostics, []);
      assert.equal(calls, 1);
    }
  }
});

test('unknown parents still block suffix ownership and grouping commands require children', () => {
  const p = defineCli({ name: 'tool', options: [{ name: 'known', kind: 'boolean', flags: ['--known'] }], commands: [{ name: 'run' }] });
  for (const suffix of ['run', 'value', '--known', '--']) {
    const parser = scripted([step(1, { unknownFlags: [{ argvElement: '--extra', flag: '--extra', argvIndex: 0 }] })], () => { throw new Error('must not decode uncertain ownership'); });
    const route = parser.route(p, { argv: ['--extra', suffix] });
    assert.equal(route.status, 'invalid');
    assert.equal(route.classification.complete, false);
    assert.deepEqual(route.classification.unclassified, [arg(suffix, 1)]);
    assert.deepEqual(route.command.path, []);
    assert.equal(parser.bind(route, { unknownFlagPolicy: 'collect' }).status, 'invalid');
  }
  const batched = scripted([step(2, {
    unknownFlags: [{ argvElement: '--extra', flag: '--extra', argvIndex: 0 }],
    options: [occurrence('known', '--known', 1)]
  })]).route(p, { argv: ['--extra', '--known'] });
  assert.equal(batched.status, 'invalid');
  const group = defineCli({ name: 'tool', invokable: false, commands: [{ name: 'run' }] });
  const result = scripted([step(1, { unknownFlags: [{ argvElement: '--extra', flag: '--extra', argvIndex: 0 }] })]).parse(group, { argv: ['--extra'], unknownFlagPolicy: 'collect' });
  assert.equal(result.status, 'invalid');
  assert.equal(result.diagnostics[0].code, 'CLI_SUBCOMMAND_REQUIRED');
});

test('large owned passthrough spans retain every token in order', () => {
  const values = Array.from({ length: 150000 }, (_, index) => `value-${index}`);
  const p = defineCli({ name: 'tool', acceptsPassthroughArguments: true });
  const parser = scripted([step(values.length + 1, {
    doubleDashArgvIndex: 0, afterDoubleDash: values.map((value, index) => arg(value, index + 1))
  })]);
  const result = parser.parse(p, { argv: ['--', ...values] });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.passthroughArguments, values);
});

test('large owned option and control clusters retain offsets and prior spans', () => {
  const size = 130000;
  for (const field of ['options', 'controlOptions', 'unknownFlags']) {
    const token = `-${'v'.repeat(size)}`;
    const entries = Array.from({ length: size }, (_, index) => ({
      ...(field === 'unknownFlags' ? {} : { option: 'verbose' }),
      flag: '-v', argvElement: token, argvIndex: 1, offset: index + 1
    }));
    const p = defineCli({ name: 'tool', options: field === 'options' ? [{ name: 'verbose', kind: 'count', flags: ['-v'] }] : [] });
    const parser = scripted([
      step(1, { [field]: [{ ...(field === 'unknownFlags' ? {} : { option: 'verbose' }), flag: '-v', argvElement: '-v', argvIndex: 0 }] }),
      step(2, { [field]: entries })
    ], () => field === 'options' ? bound({ verbose: size + 1 }, { verbose: true }) : bound());
    const route = parser.route(p, { argv: ['-v', token] });
    assert.equal(route.status, 'routed');
    assert.equal(route.classification[field].length, size + 1);
    assert.equal(route.classification[field][0].argvIndex, 0);
    assert.deepEqual(route.classification[field].slice(1), entries);
    assert.equal(parser.bind(route, { unknownFlagPolicy: 'collect' }).status, 'ready');
  }
});

test('terminator spans exclusively own the complete ordered passthrough suffix', () => {
  const p = defineCli({ name: 'tool', options: [{ name: 'on', kind: 'boolean', flags: ['--on'] }] });
  const entries = {
    options: occurrence('on', '--on', 1),
    controlOptions: occurrence('help', '--on', 1),
    unknownFlags: { flag: '--on', argvElement: '--on', argvIndex: 1 },
    arguments: arg('--on', 1), controls: arg('--on', 1), unclassified: arg('--on', 1)
  };
  for (const [field, entry] of Object.entries(entries)) {
    const parser = scripted([step(2, { doubleDashArgvIndex: 0, [field]: [entry], diagnostics: [error()] })],
      () => { throw new Error('must not decode malformed terminator'); });
    const route = parser.route(p, { argv: ['--', '--on'] });
    assert.equal(route.status, 'invalid', field);
    assert.equal(route.classification.complete, false, field);
    assert.equal(route.diagnostics[0].code, 'CLI_INVALID_BINDER_RESULT', field);
    assert.deepEqual(route.classification[field], field === 'unclassified' ? [arg('--', 0), arg('--on', 1)] : [], field);
    assert.equal(parser.bind(route).status, 'invalid', field);
  }
  for (const malformed of [
    step(2, { doubleDashArgvIndex: 0, afterDoubleDash: [arg('a', 1)] }),
    step(3, { doubleDashArgvIndex: 0, afterDoubleDash: [arg('b', 2), arg('a', 1)] }),
    step(3, { doubleDashArgvIndex: 0, afterDoubleDash: [arg('a', 1)] })
  ]) {
    const route = scripted([malformed]).route(p, { argv: ['--', 'a', 'b'] });
    assert.equal(route.status, 'invalid');
    assert.equal(route.classification.complete, false);
    assert.equal(route.diagnostics[0].code, 'CLI_INVALID_BINDER_RESULT');
  }
  for (const acceptsPassthroughArguments of [false, true]) {
    const program = defineCli({ name: 'tool', acceptsPassthroughArguments });
    const result = scripted([step(3, { doubleDashArgvIndex: 0, afterDoubleDash: [arg('--on', 1), arg('--', 2)] })])
      .parse(program, { argv: ['--', '--on', '--'] });
    assert.equal(result.status, acceptsPassthroughArguments ? 'ready' : 'invalid');
    if (result.status === 'ready') assert.deepEqual(result.passthroughArguments, ['--on', '--']);
    else assert.equal(result.diagnostics[0].code, 'CLI_PASSTHROUGH_ARGUMENTS_NOT_ACCEPTED');
    assert.equal(scripted([step(1, { doubleDashArgvIndex: 0 })]).parse(program, { argv: ['--'] }).status, 'ready');
  }
});

test('batched scans cannot classify beyond an unknown parent or unclassified ownership boundary', () => {
  const p = defineCli({ name: 'tool', options: [{ name: 'on', kind: 'boolean', flags: ['--on'] }], commands: [{ name: 'run' }] });
  const suffixes = {
    options: occurrence('on', '--on', 2), controlOptions: occurrence('help', '--on', 2),
    unknownFlags: { flag: '--on', argvElement: '--on', argvIndex: 2 },
    arguments: arg('--on', 2), controls: arg('--on', 2), unclassified: arg('--on', 2)
  };
  for (const uncertainField of ['unknownFlags', 'unclassified']) {
    for (const [field, entry] of Object.entries(suffixes)) {
      if (uncertainField === 'unclassified' && field === 'unclassified') continue;
      const uncertain = uncertainField === 'unknownFlags'
        ? { flag: '--local', argvElement: '--local', argvIndex: 1 } : arg('--local', 1);
      const fields = { [uncertainField]: [uncertain], diagnostics: [error()] };
      fields[field] = [...(fields[field] ?? []), entry];
      const parser = scripted([
        step(1, { controlOptions: [occurrence('prior', '--prior', 0)] }), step(3, fields)
      ], () => { throw new Error('must not decode uncertain ownership'); });
      const route = parser.route(p, { argv: ['--prior', '--local', '--on'] });
      assert.equal(route.status, 'invalid', `${uncertainField}/${field}`);
      assert.equal(route.classification.complete, false);
      assert.equal(route.diagnostics[0].code, 'CLI_INVALID_BINDER_RESULT');
      assert.deepEqual(route.classification.controlOptions, [occurrence('prior', '--prior', 0)]);
      assert.deepEqual(route.classification.options, []);
      assert.deepEqual(route.classification.arguments, []);
      assert.deepEqual(route.classification.controls, []);
      assert.deepEqual(route.classification.unknownFlags, []);
      assert.deepEqual(route.classification.unclassified, [arg('--local', 1), arg('--on', 2)]);
      assert.equal(parser.bind(route, { unknownFlagPolicy: 'collect' }).status, 'invalid');
    }
  }
});

test('safe batched prefixes, separate values, clusters and unclassified suffixes retain ownership', () => {
  const p = defineCli({ name: 'tool', options: [{ name: 'value', kind: 'value', flags: ['-v'], valueMode: 'required' }], commands: [{ name: 'run' }] });
  const known = occurrence('value', '-v', 0, { rawValue: '--help', valueArgvIndex: 1, inline: false });
  const unknown = { flag: '-x', argvElement: '-xh', argvIndex: 2, offset: 1 };
  const control = occurrence('help', '-h', 2, { argvElement: '-xh', offset: 2 });
  const parser = scripted([step(3, { options: [known], unknownFlags: [unknown], controlOptions: [control] })],
    () => bound({ value: '--help' }, { value: true }));
  const route = parser.route(p, { argv: ['-v', '--help', '-xh'] });
  assert.equal(route.status, 'routed');
  assert.equal(route.classification.complete, true);
  assert.deepEqual(route.classification.options, [known]);
  assert.deepEqual(route.classification.controlOptions, [control]);
  assert.equal(parser.bind(route, { unknownFlagPolicy: 'collect' }).status, 'ready');
  const incomplete = scripted([step(3, {
    options: [known], unknownFlags: [unknown], controlOptions: [control]
  })]).route(p, { argv: ['-v', '--help', '-xh', 'run'] });
  assert.equal(incomplete.status, 'invalid');
  assert.equal(incomplete.classification.complete, false);
  assert.deepEqual(incomplete.classification.controlOptions, [control]);
  assert.deepEqual(incomplete.classification.unclassified, [arg('run', 3)]);
  const unclassified = scripted([step(3, {
    controlOptions: [occurrence('help', '--help', 0)],
    unclassified: [arg('bad', 1), arg('rest', 2)], diagnostics: [error()]
  })]).route(p, { argv: ['--help', 'bad', 'rest'] });
  assert.equal(unclassified.status, 'invalid');
  assert.equal(unclassified.classification.complete, false);
  assert.deepEqual(unclassified.classification.controlOptions, [occurrence('help', '--help', 0)]);
  assert.deepEqual(unclassified.classification.unclassified, [arg('bad', 1), arg('rest', 2)]);
  assert.equal(unclassified.diagnostics[0].code, 'VALUE_ERROR');
});

test('leaf unknown batches and binder-owned terminator-like values stay classified', () => {
  const leaf = defineCli({ name: 'tool', options: [{ name: 'value', kind: 'value', flags: ['-v'], valueMode: 'required' }] });
  const unknown = { flag: '--local', argvElement: '--local', argvIndex: 0 };
  const control = occurrence('help', '--help', 1);
  const parser = scripted([step(4, {
    unknownFlags: [unknown], controlOptions: [control],
    options: [occurrence('value', '-v', 2, { rawValue: '--', valueArgvIndex: 3, inline: false })]
  })], () => bound({ value: '--' }, { value: true }));
  const route = parser.route(leaf, { argv: ['--local', '--help', '-v', '--'] });
  assert.equal(route.status, 'routed');
  assert.equal(route.classification.complete, true);
  assert.deepEqual(route.classification.unknownFlags, [unknown]);
  assert.deepEqual(route.classification.controlOptions, [control]);
  assert.equal(parser.bind(route, { unknownFlagPolicy: 'collect' }).status, 'ready');
});

test('separate values cannot cross an unknown cluster routing boundary', () => {
  const p = defineCli({ name: 'tool', options: [{ name: 'value', kind: 'value', flags: ['-v'], valueMode: 'required' }], commands: [{ name: 'run' }] });
  for (const field of ['options', 'controlOptions']) {
    const route = scripted([step(2, {
      [field]: [occurrence('value', '-v', 0, { argvElement: '-xv', offset: 2, rawValue: '--help', valueArgvIndex: 1, inline: false })],
      unknownFlags: [{ flag: '-x', argvElement: '-xv', argvIndex: 0, offset: 1 }]
    })]).route(p, { argv: ['-xv', '--help'] });
    assert.equal(route.status, 'invalid');
    assert.equal(route.classification.complete, false);
    assert.deepEqual(route.classification[field], []);
    assert.deepEqual(route.classification.unclassified, [arg('-xv', 0), arg('--help', 1)]);
    assert.equal(route.diagnostics[0].code, 'CLI_INVALID_BINDER_RESULT');
  }
});

test('scan and decode diagnostics retain stage ownership without lossy equality', () => {
  const p = defineCli({ name: 'tool' });
  const scan = createCliOptionDiagnostic('SAME', 'warning', 'same', { payload: { stage: 'scan' } });
  const decode = createCliOptionDiagnostic('SAME', 'error', 'same', { payload: { stage: 'decode' } });
  const parser = scripted([step(1, { controls: [arg('x', 0)], diagnostics: [scan] })],
    () => ({ status: 'invalid', diagnostics: [decode, createCliOptionDiagnostic('SAME', 'error', 'same', { other: true })] }));
  const result = parser.parse(p, { argv: ['x'] });
  assert.equal(result.status, 'invalid');
  assert.deepEqual(result.diagnostics.map(({ severity }) => severity), ['warning', 'error', 'error']);
  assert.equal(result.diagnostics[0].details.payload, scan.details.payload);
  assert.equal(result.diagnostics[1].details.payload, decode.details.payload);
  for (const retained of [[], [createCliOptionDiagnostic('SCAN', 'warning', 'warning')], [error('SCAN')]]) {
    const parser = scripted([step(1, { controls: [arg('x', 0)], diagnostics: retained })], () => ({ status: 'invalid', diagnostics: [] }));
    const result = parser.parse(p, { argv: ['x'] });
    assert.equal(result.status, 'invalid');
    assert.equal(result.diagnostics.some(({ severity }) => severity === 'error'), true);
    assert.equal(result.diagnostics.some(({ code }) => code === 'CLI_INVALID_BINDER_RESULT'), !retained.some(({ severity }) => severity === 'error'));
    assert.equal(result.diagnostics.filter(({ code }) => code === 'SCAN').length, retained.length);
  }
});

test('unknown policy applies to routing failures and malformed decoding while uncertainty survives collect', () => {
  const unknown = { flag: '--wat', argvElement: '--wat', argvIndex: 0 };
  const leaf = defineCli({ name: 'tool' });
  const scenarios = [
    [leaf, [step(1, { unknownFlags: [unknown] }), step(1)], ['--wat', 'bad'], () => bound()],
    [leaf, [step(1, { unknownFlags: [unknown] })], ['--wat'], () => null],
    [defineCli({ name: 'tool', invokable: false, commands: [{ name: 'run' }] }), [step(1, { unknownFlags: [unknown] })], ['--wat'], () => bound()],
    [defineCli({ name: 'tool', commands: [{ name: 'run' }] }), [step(1, { unknownFlags: [unknown] })], ['--wat', 'run'], () => bound()]
  ];
  for (const [program, steps, argv, decode] of scenarios) {
    const parser = scripted(steps, decode);
    const route = parser.route(program, { argv });
    for (const policy of ['error', 'collect']) {
      const result = parser.bind(route, { unknownFlagPolicy: policy });
      assert.equal(result.status, 'invalid');
      assert.equal(result.diagnostics.filter(({ code }) => code === 'CLI_UNKNOWN_FLAG').length, policy === 'error' ? 1 : 0);
      assert.equal(result.diagnostics.some(({ severity }) => severity === 'error'), true);
    }
  }
  const parser = scripted([step(1, { unknownFlags: [unknown] })]);
  const uncertain = parser.parse(defineCli({ name: 'tool', commands: [{ name: 'run' }] }), { argv: ['--wat', 'run'], unknownFlagPolicy: 'collect' });
  const diagnostic = uncertain.diagnostics.find(({ code }) => code === 'CLI_ROUTING_UNCERTAIN');
  assert.deepEqual(diagnostic.flags, [unknown]);
  assert.equal(Object.isFrozen(diagnostic.flags), true);
});

test('structured positional validation covers missing, undefined, shape, required variadic and undeclared names', () => {
  const scalar = defineCli({ name: 'tool', positionals: [{ name: 'value' }] });
  const optional = defineCli({ name: 'tool', positionals: [{ name: 'value', required: false }] });
  const variadic = defineCli({ name: 'tool', positionals: [{ name: 'value', variadic: true }] });
  const optionalVariadic = defineCli({ name: 'tool', positionals: [{ name: 'value', variadic: true, required: false }] });
  const invoke = (program, positionalValues) => createCliInvocation(program, { optionValues: {}, specifiedOptions: {}, positionalValues });
  for (const [program, positionals] of [[scalar, {}], [optional, {}], [scalar, { value: undefined }], [scalar, { value: [] }], [scalar, { value: 1 }], [variadic, { value: 'x' }], [variadic, { value: undefined }], [variadic, { value: [] }], [variadic, { value: [1] }], [scalar, { value: 'x', extra: 'y' }]]) {
    const result = invoke(program, positionals);
    assert.equal(result.status, 'invalid');
    assert.equal(result.diagnostics[0].code, 'CLI_INVALID_STRUCTURED_INVOCATION');
    assert.equal(Object.isFrozen(result.diagnostics[0]), true);
  }
  for (const [program, positionals] of [[scalar, { value: 'x' }], [optional, { value: undefined }], [variadic, { value: ['x'] }], [optionalVariadic, { value: [] }]]) {
    const result = invoke(program, positionals);
    assert.equal(result.status, 'ready');
    assert.deepEqual(Object.entries(result.positionalValues), Object.entries(positionals));
    assert.equal(Object.isFrozen(result.positionalValues), true);
    if (Array.isArray(result.positionalValues.value)) assert.equal(Object.isFrozen(result.positionalValues.value), true);
  }
});

test('decoded presence must match the authoritative scan in both directions', () => {
  const p = defineCli({ name: 'tool', options: [{ name: 'on', kind: 'boolean', flags: ['--on'] }] });
  for (const scanned of [true, false]) {
    const parser = scripted(scanned ? [step(1, { options: [occurrence('on', '--on', 0)] })] : [],
      () => bound(scanned ? {} : { on: true }, { on: !scanned }));
    const result = parser.parse(p, { argv: scanned ? ['--on'] : [] });
    assert.equal(result.status, 'invalid');
    assert.match(result.diagnostics[0].reason, /presence disagrees/u);
  }
});

test('malformed diagnostic fields reject independently at scan and decode boundaries', () => {
  const p = defineCli({ name: 'tool' });
  const valid = { source: 'option', code: 'ISSUE', severity: 'error', message: 'issue', details: {} };
  const malformed = [null, { ...valid, source: 'command' }, { ...valid, code: 1 }, { ...valid, severity: 'fatal' }, { ...valid, message: 1 }, { ...valid, details: [] }, { ...valid, details: undefined }];
  for (const diagnostic of malformed) {
    const scan = scripted([step(1, { controls: [arg('x', 0)], diagnostics: [diagnostic] })]).parse(p, { argv: ['x'] });
    const decode = scripted([], () => ({ status: 'invalid', diagnostics: [diagnostic] })).parse(p);
    for (const [result, stage] of [[scan, 'scan'], [decode, 'bind']]) {
      assert.equal(result.status, 'invalid');
      assert.equal(result.diagnostics[0].code, 'CLI_INVALID_BINDER_RESULT');
      assert.equal(result.diagnostics[0].stage, stage);
    }
  }
});

test('framework diagnostics cannot poison cached results while nested application payloads remain opaque', () => {
  const deprecated = defineCli({ name: 'tool', commands: [{ name: 'old', deprecated: true }] });
  const missing = defineCli({ name: 'tool', positionals: [{ name: 'required' }] });
  const variadic = defineCli({ name: 'tool', positionals: [{ name: 'required', variadic: true }] });
  for (const program of [deprecated, missing, variadic]) {
    const parser = scripted(program === deprecated ? [step(1, { arguments: [arg('old', 0)] })] : []);
    const route = parser.route(program, { argv: program === deprecated ? ['old'] : [] });
    const result = parser.bind(route);
    assert.equal(Object.isFrozen(result.diagnostics[0]), true);
    assert.throws(() => { result.diagnostics[0].severity = 'error'; }, TypeError);
    assert.equal(parser.bind(route), result);
    assert.equal(parser.bind(route, { unknownFlagPolicy: 'collect' }).diagnostics[0].severity, result.diagnostics[0].severity);
  }
  const structured = createCliInvocation(deprecated, { commandPath: ['missing'], optionValues: {}, specifiedOptions: {}, positionalValues: {} });
  assert.equal(Object.isFrozen(structured.diagnostics[0]), true);
  const extra = scripted([step(1, { arguments: [arg('x', 0)] })]).parse(defineCli({ name: 'tool' }), { argv: ['x'] });
  assert.equal(Object.isFrozen(extra.diagnostics[0]), true);
  assert.equal(Object.isFrozen(extra.diagnostics[0].values), true);
  const payload = { nested: ['application-owned'] };
  const p = defineCli({ name: 'tool', options: [{ name: 'value', kind: 'boolean', flags: ['--value'], hasDefault: true }] });
  const result = scripted([], () => bound({ value: payload }, { value: false })).parse(p);
  assert.equal(result.status, 'ready');
  assert.equal(result.optionValues.value, payload);
  assert.equal(Object.isFrozen(payload), false);
  const diagnostic = createCliOptionDiagnostic('PAYLOAD', 'warning', 'payload', { payload });
  const scanned = scripted([step(1, { controls: [arg('x', 0)], diagnostics: [diagnostic] })]).parse(defineCli({ name: 'tool' }), { argv: ['x'] });
  assert.equal(scanned.diagnostics[0].details.payload, payload);
  assert.equal(Object.isFrozen(scanned.diagnostics[0].details), true);
  assert.equal(Object.isFrozen(payload.nested), false);
});


test('core unknown policy cannot explain an otherwise unexplained decoder failure', () => {
  const p = defineCli({ name: 'tool' });
  for (const scanDiagnostics of [[], [error('LEXICAL_ERROR')]]) {
    const parser = scripted([step(1, {
      unknownFlags: [{ flag: '--wat', argvElement: '--wat', argvIndex: 0 }],
      diagnostics: scanDiagnostics
    })], () => ({ status: 'invalid', diagnostics: [] }));
    const route = parser.route(p, { argv: ['--wat'] });
    for (const unknownFlagPolicy of ['error', 'collect']) {
      const result = parser.bind(route, { unknownFlagPolicy });
      assert.equal(result.status, 'invalid');
      assert.equal(result.diagnostics.filter(({ code }) => code === 'CLI_INVALID_BINDER_RESULT').length, scanDiagnostics.length === 0 ? 1 : 0);
      assert.equal(result.diagnostics.filter(({ code }) => code === 'CLI_UNKNOWN_FLAG').length, unknownFlagPolicy === 'error' ? 1 : 0);
      assert.equal(result.diagnostics.filter(({ code }) => code === 'LEXICAL_ERROR').length, scanDiagnostics.length);
    }
  }
});
