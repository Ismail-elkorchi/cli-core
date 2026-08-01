import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CliHandlerNotFoundError,
  completeCli,
  createCliHelp,
  createCliInvocation,
  defineCli,
  dispatchCli
} from '../../dist/index.js';

const program = defineCli({
  name: 'ship',
  options: [{
    name: 'verbose',
    kind: 'boolean',
    flags: ['-v', '--verbose'],
    falseFlags: ['--no-verbose'],
    description: 'Show details.'
  }],
  commands: [{
    name: 'deploy',
    aliases: ['d'],
    description: 'Deploy one service.',
    options: [{
      name: 'region',
      kind: 'value',
      flags: ['-r', '--region'],
      valueMode: 'required',
      valueLabel: 'region',
      valueCandidates: ['eu', 'us'],
      hasDefault: true,
      defaultLabel: 'eu'
    }],
    positionals: [{ name: 'service' }]
  }]
});

test('help retains neutral option semantics and rejects unknown paths', () => {
  const help = createCliHelp(program, ['deploy']);
  assert.equal(help?.usage, 'ship deploy [options] <service>');
  assert.deepEqual(help?.options[0].falseFlags, ['--no-verbose']);
  assert.deepEqual(help?.options[1].valueCandidates, ['eu', 'us']);
  assert.equal(help?.options[1].defaultLabel, 'eu');
  assert.equal(createCliHelp(program, ['typo']), undefined);
});

test('completion returns commands, unused flags, and option values but not positional labels', () => {
  assert.deepEqual(
    completeCli(program, { commandPath: ['deploy'], prefix: '--r' }),
    [{ kind: 'flag', value: '--region', option: 'region' }]
  );
  assert.deepEqual(
    completeCli(program, { commandPath: ['deploy'], option: 'region', prefix: 'u' }),
    [{ kind: 'option-value', value: 'us', option: 'region' }]
  );
  assert.deepEqual(
    completeCli(program, {
      commandPath: ['deploy'],
      prefix: '',
      specifiedOptions: { verbose: true, region: true }
    }),
    []
  );
  assert.equal(completeCli(program, { commandPath: ['typo'] }), undefined);
});

test('dispatch propagates results and reports missing handlers', async () => {
  const invocation = createCliInvocation(program, {
    commandPath: ['deploy'],
    optionValues: { region: 'eu' },
    specifiedOptions: { verbose: false, region: false },
    positionalValues: { service: 'api' }
  });
  assert.equal(invocation.status, 'parsed');
  if (invocation.status !== 'parsed') return;

  const value = await dispatchCli(invocation, {
    'ship deploy': ({ invocation: parsed, context }) =>
      `${String(parsed.positionalValues.service)}:${context}`
  }, 'production');
  assert.equal(value, 'api:production');

  await assert.rejects(
    dispatchCli(invocation, {}, undefined),
    (error) => error instanceof CliHandlerNotFoundError && error.commandKey === 'ship deploy'
  );
});
