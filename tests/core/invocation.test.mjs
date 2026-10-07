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
  ].map((entry) => (scope) => { scopes.push(scope.command.key); return entry; });
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
