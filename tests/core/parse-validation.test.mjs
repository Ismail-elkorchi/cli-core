import assert from 'node:assert/strict';
import test from 'node:test';
import { createCliDiagnostic } from '../../dist/diagnostics.js';
import { defineCli, parseCli, validateCli } from '../../dist/index.js';

test('parseCli defaults to the root command with empty argv', () => {
  const program = defineCli({ name: 'ship', commands: [{ name: 'deploy' }] });
  const invocation = parseCli(program);

  assert.equal(invocation.ok, true);
  assert.deepEqual(invocation.argv, []);
  assert.equal(invocation.command?.id, 'root');
  assert.deepEqual(invocation.commandPath, []);
  assert.deepEqual(invocation.diagnostics, []);
  assert.deepEqual(invocation.passThrough, []);
});

test('parseCli preserves unknown options without diagnostics when explicitly allowed', () => {
  const program = defineCli({
    name: 'ship',
    commands: [{ name: 'deploy', options: [{ name: 'region', type: 'string', flags: ['--region'] }] }]
  });
  const denied = parseCli(program, { argv: ['deploy', '--unknown'] });
  const allowed = parseCli(program, { argv: ['deploy', '--unknown'], allowUnknownOptions: true });

  assert.equal(denied.ok, false);
  assert.equal(denied.diagnostics[0].code, 'CLI_UNKNOWN_OPTION');
  assert.equal(denied.diagnostics[0].severity, 'error');
  assert.deepEqual(denied.diagnostics[0].fields, { option: '--unknown' });
  assert.equal(allowed.ok, true);
  assert.deepEqual(allowed.options.unknown, ['--unknown']);
  assert.deepEqual(allowed.diagnostics, []);
});

test('parseCli treats leading option tokens as root options, not command names', () => {
  const program = defineCli({
    name: 'ship',
    options: [{ name: 'verbose', type: 'boolean', flags: ['--verbose'] }],
    commands: [{ name: 'deploy' }]
  });
  const invocation = parseCli(program, { argv: ['--verbose'] });

  assert.equal(invocation.ok, true);
  assert.deepEqual(invocation.commandPath, []);
  assert.deepEqual(invocation.options.values, { verbose: true });
  assert.deepEqual(invocation.diagnostics, []);
});

test('parseCli reports unknown command diagnostics with stable fields', () => {
  const program = defineCli({ name: 'ship', commands: [{ name: 'deploy' }] });
  const invocation = parseCli(program, { argv: ['deply', 'api'] });

  assert.equal(invocation.ok, false);
  assert.equal(invocation.command?.id, 'root');
  assert.deepEqual(invocation.commandPath, []);
  assert.equal(invocation.diagnostics[0].code, 'CLI_UNKNOWN_COMMAND');
  assert.equal(invocation.diagnostics[0].severity, 'error');
  assert.deepEqual(invocation.diagnostics[0].fields, { commandPath: ['deply', 'api'] });
});

test('validateCli can treat warnings as failures without duplicating program diagnostics', async () => {
  const program = defineCli({
    name: 'ship',
    commands: [
      { name: 'remove', aliases: [{ name: 'rm', deprecated: 'Use remove.' }] },
      { name: 'status' },
      { name: 'status' }
    ]
  });
  const invocation = parseCli(program, { argv: ['rm'] });
  const defaultValidation = await validateCli(program, invocation);
  const strictValidation = await validateCli(program, invocation, { allowWarnings: false });

  assert.equal(invocation.ok, false);
  assert.equal(defaultValidation.ok, false);
  assert.equal(strictValidation.ok, false);
  assert.deepEqual(defaultValidation.diagnostics.map((diagnostic) => diagnostic.code), [
    'CLI_DUPLICATE_COMMAND_PATH',
    'CLI_DEPRECATED_ALIAS'
  ]);
  assert.equal(strictValidation.diagnostics[1].severity, 'warning');
});

test('validateCli treats alias warnings as valid by default and invalid in strict warning mode', async () => {
  const program = defineCli({
    name: 'ship',
    commands: [{ name: 'remove', aliases: [{ name: 'rm', deprecated: true }] }]
  });
  const invocation = parseCli(program, { argv: ['rm'] });
  const defaultValidation = await validateCli(program, invocation);
  const strictValidation = await validateCli(program, invocation, { allowWarnings: false });

  assert.equal(invocation.ok, true);
  assert.equal(defaultValidation.ok, true);
  assert.equal(strictValidation.ok, false);
});

test('parseCli treats a leading double dash as a pass-through boundary', () => {
  const program = defineCli({ name: 'ship' });
  const invocation = parseCli(program, { argv: ['--', '--trace'] });

  assert.equal(invocation.ok, true);
  assert.deepEqual(invocation.commandPath, []);
  assert.deepEqual(invocation.passThrough, ['--trace']);
  assert.deepEqual(invocation.diagnostics.map((diagnostic) => diagnostic.code), ['CLI_PASS_THROUGH_UNDECLARED']);
  assert.equal(invocation.diagnostics[0].severity, 'warning');
  assert.deepEqual(invocation.diagnostics[0].fields, {
    commandPath: [],
    passThrough: ['--trace']
  });
});

test('parseCli slices variadic positionals after earlier positionals', () => {
  const program = defineCli({
    name: 'archive',
    commands: [
      {
        name: 'pack',
        positionals: [{ name: 'target' }, { name: 'files', variadic: true }]
      }
    ]
  });
  const invocation = parseCli(program, { argv: ['pack', 'dist.tar', 'a.js', 'b.js'] });

  assert.equal(invocation.ok, true);
  assert.deepEqual(invocation.positionals, {
    target: 'dist.tar',
    files: ['a.js', 'b.js']
  });
});

test('parseCli reports required variadic and missing positional inputs', () => {
  const program = defineCli({
    name: 'copy',
    commands: [
      { name: 'collect', positionals: [{ name: 'files', variadic: true }] },
      { name: 'one', positionals: [{ name: 'target' }] }
    ]
  });
  const missingVariadic = parseCli(program, { argv: ['collect'] });
  const missingSingle = parseCli(program, { argv: ['one'] });

  assert.equal(missingVariadic.ok, false);
  assert.deepEqual(missingVariadic.positionals, { files: [] });
  assert.deepEqual(missingVariadic.diagnostics[0].fields, {
    commandPath: ['collect'],
    positional: 'files'
  });
  assert.equal(missingVariadic.diagnostics[0].code, 'CLI_MISSING_POSITIONAL');
  assert.equal(missingVariadic.diagnostics[0].severity, 'error');
  assert.equal(missingSingle.ok, false);
  assert.deepEqual(missingSingle.positionals, { target: undefined });
  assert.deepEqual(missingSingle.diagnostics[0].fields, {
    commandPath: ['one'],
    positional: 'target'
  });
});

test('parseCli does not report missing diagnostics for absent optional positionals', () => {
  const program = defineCli({
    name: 'maybe',
    commands: [{ name: 'name', positionals: [{ name: 'value', required: false }] }]
  });
  const invocation = parseCli(program, { argv: ['name'] });

  assert.equal(invocation.ok, true);
  assert.deepEqual(invocation.positionals, { value: undefined });
  assert.deepEqual(invocation.diagnostics, []);
});

test('parseCli reports only extra unexpected positional values', () => {
  const program = defineCli({
    name: 'ship',
    commands: [{ name: 'deploy', positionals: [{ name: 'service' }] }]
  });
  const invocation = parseCli(program, { argv: ['deploy', 'api', 'extra-a', 'extra-b'] });

  assert.equal(invocation.ok, false);
  assert.equal(invocation.positionals.service, 'api');
  assert.equal(invocation.diagnostics[0].code, 'CLI_UNEXPECTED_POSITIONAL');
  assert.equal(invocation.diagnostics[0].severity, 'error');
  assert.deepEqual(invocation.diagnostics[0].fields, {
    commandPath: ['deploy'],
    values: ['extra-a', 'extra-b']
  });
  assert.equal(Object.isFrozen(invocation.diagnostics[0].fields.values), true);
});

test('parseCli exposes deprecated alias payloads and keeps active alias payloads minimal', () => {
  const program = defineCli({
    name: 'ship',
    commands: [
      { name: 'remove', aliases: [{ name: 'rm', deprecated: 'Use remove.' }] },
      { name: 'delete', aliases: [{ name: 'del', deprecated: true }] },
      { name: 'list', aliases: ['ls'] }
    ]
  });
  const deprecated = parseCli(program, { argv: ['rm'] });
  const booleanDeprecated = parseCli(program, { argv: ['del'] });
  const active = parseCli(program, { argv: ['ls'] });

  assert.equal(deprecated.ok, true);
  assert.deepEqual(deprecated.usedAlias, {
    token: 'rm',
    path: ['rm'],
    canonicalPath: ['remove'],
    deprecated: 'Use remove.'
  });
  assert.deepEqual(deprecated.diagnostics[0].fields, {
    alias: 'rm',
    aliasPath: ['rm'],
    commandPath: ['remove'],
    reason: 'Use remove.'
  });
  assert.equal(booleanDeprecated.ok, true);
  assert.deepEqual(booleanDeprecated.diagnostics[0].fields, {
    alias: 'del',
    aliasPath: ['del'],
    commandPath: ['delete'],
    reason: ''
  });
  assert.equal(active.ok, true);
  assert.deepEqual(active.usedAlias, {
    token: 'ls',
    path: ['ls'],
    canonicalPath: ['list']
  });
  assert.equal(Object.hasOwn(active.usedAlias, 'deprecated'), false);
  assert.deepEqual(active.diagnostics, []);
});

test('parseCli preserves argv-flags issue fields', () => {
  const program = defineCli({
    name: 'ship',
    commands: [{ name: 'deploy', options: [{ name: 'count', type: 'number', flags: ['--count'] }] }]
  });
  const invocation = parseCli(program, { argv: ['deploy', '--count', 'many'] });

  assert.equal(invocation.ok, false);
  assert.equal(invocation.diagnostics[0].code, 'CLI_ARGV_FLAG_ISSUE');
  assert.equal(invocation.diagnostics[0].severity, 'error');
  assert.deepEqual(invocation.diagnostics[0].fields, {
    code: 'INVALID_VALUE',
    flag: '--count',
    key: 'count',
    value: 'many',
    index: 1
  });
});

test('createCliDiagnostic freezes nested diagnostic fields', () => {
  const fields = { nested: { values: ['secret'], empty: null } };
  const diagnostic = createCliDiagnostic('CLI_UNKNOWN_COMMAND', 'error', 'Unknown command.', fields);

  fields.nested.values.push('mutated');
  assert.deepEqual(diagnostic.fields, {
    nested: { values: ['secret'], empty: null }
  });
  assert.equal(Object.isFrozen(diagnostic.fields), true);
  assert.equal(Object.isFrozen(diagnostic.fields.nested), true);
  assert.equal(Object.isFrozen(diagnostic.fields.nested.values), true);
  assert.throws(() => {
    diagnostic.fields.nested.values.push('other');
  }, TypeError);
});
