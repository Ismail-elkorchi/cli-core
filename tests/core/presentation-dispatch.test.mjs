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
      valueMode: 'optional-inline',
      valueLabel: 'region',
      valueDescription: 'Deployment region.',
      implicitValueLabel: 'automatic',
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
  assert.equal(help?.options[1].valueDescription, 'Deployment region.');
  assert.equal(help?.options[1].implicitValueLabel, 'automatic');
  assert.equal(createCliHelp(program, ['typo']), undefined);
});

test('multiplicity does not invent default-value metadata', () => {
  const requiredMultiple = defineCli({
    name: 'tag',
    options: [{
      name: 'labels',
      kind: 'value',
      flags: ['--label'],
      valueMode: 'required',
      multiple: true,
      required: true,
      hasDefault: false
    }]
  });
  assert.equal(requiredMultiple.root.options[0]?.multiple, true);
  assert.equal(requiredMultiple.root.options[0]?.hasDefault, false);
  assert.equal(createCliHelp(requiredMultiple)?.options[0]?.hasDefault, false);
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
  assert.equal(invocation.status, 'ready');
  if (invocation.status !== 'ready') return;

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
