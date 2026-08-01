import assert from 'node:assert/strict';
import test from 'node:test';
import { createCliDiagnostic } from '../../dist/diagnostics.js';
import {
  createCliInvocationParser,
  defineCli,
  parseCli,
  validateCli
} from '../support/invocation-parser.mjs';

test('invocation parser supplies a stable matched command and argv offset to the binder', () => {
  const program = defineCli({
    name: 'ship',
    commands: [{
      name: 'deploy',
      options: [{ name: 'region', type: 'string', flags: ['--region'] }],
      positionals: [{ name: 'service' }]
    }]
  });
  let bindingInput;
  const parser = createCliInvocationParser((input) => {
    bindingInput = input;
    return {
      values: { region: 'eu' },
      present: { region: true },
      positionals: ['api'],
      afterDoubleDash: [],
      unknownOptions: [],
      diagnostics: []
    };
  });

  const invocation = parser.parse(program, { argv: ['deploy', '--region', 'eu', 'api'] });

  assert.equal(bindingInput.command, program.commands[1]);
  assert.equal(Object.isFrozen(bindingInput.options), true);
  assert.deepEqual(bindingInput.argv, ['--region', 'eu', 'api']);
  assert.equal(bindingInput.argvOffset, 1);
  assert.equal(invocation.ok, true);
});

test('invocation parser preserves indexed clustered unknown options', () => {
  const program = defineCli({ name: 'ship', commands: [{ name: 'deploy' }] });
  const parser = createCliInvocationParser(() => ({
    values: {},
    present: {},
    positionals: [],
    afterDoubleDash: [],
    unknownOptions: [{ argvElement: '-vx', option: '-x', argvIndex: 1, offset: 2 }],
    diagnostics: []
  }));

  const invocation = parser.parse(program, { argv: ['deploy', '-vx'] });

  assert.deepEqual(invocation.options.unknown, [{
    argvElement: '-vx',
    option: '-x',
    argvIndex: 1,
    offset: 2
  }]);
  assert.deepEqual(invocation.diagnostics[0].fields, {
    option: '-x',
    argvElement: '-vx',
    argvIndex: 1,
    offset: 2
  });
});

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
  assert.deepEqual(denied.diagnostics[0].fields, {
    option: '--unknown',
    argvElement: '--unknown',
    argvIndex: 1
  });
  assert.equal(allowed.ok, true);
  assert.deepEqual(allowed.options.unknown, [{
    argvElement: '--unknown',
    option: '--unknown',
    argvIndex: 1
  }]);
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

test('validateCli accepts a clean invocation when warnings are rejected', async () => {
  const program = defineCli({ name: 'ship' });
  const invocation = parseCli(program);

  const validation = await validateCli(program, invocation, { allowWarnings: false });

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.diagnostics, []);
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

test('invocation parsing preserves option-binder diagnostics', () => {
  const program = defineCli({
    name: 'ship',
    commands: [{ name: 'deploy', options: [{ name: 'count', type: 'number', flags: ['--count'] }] }]
  });
  const invocation = parseCli(program, { argv: ['deploy', '--count', 'many'] });

  assert.equal(invocation.ok, false);
  assert.equal(invocation.diagnostics[0].code, 'CLI_OPTION_BINDING_FAILED');
  assert.equal(invocation.diagnostics[0].severity, 'error');
  assert.deepEqual(invocation.diagnostics[0].fields, {
    reason: 'INVALID_VALUE',
    option: 'count',
    flag: '--count',
    rawValue: 'many',
    argvIndex: 1
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
