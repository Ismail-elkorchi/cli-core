import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CliHandlerNotFoundError,
  completeCli,
  createCliHelp,
  createCliInvocationParser,
  defineCli,
  dispatchCli
} from '../../dist/index.js';

const program = defineCli({
  name: 'ship',
  options: [{ name: 'verbose', flags: ['-v', '--verbose'], valueMode: 'none', description: 'Show details.' }],
  commands: [{
    name: 'deploy',
    aliases: ['d'],
    description: 'Deploy one service.',
    options: [
      { name: 'region', flags: ['-r', '--region'], valueMode: 'required', valueLabel: 'region' },
      { name: 'secret', flags: ['--secret'], valueMode: 'required', hidden: true }
    ],
    positionals: [{ name: 'service' }]
  }]
});

test('help contains only presentation data needed by renderers', () => {
  const help = createCliHelp(program, ['deploy']);
  assert.equal(help.usage, 'ship deploy [options] <service>');
  assert.deepEqual(help.options.map((option) => option.name), ['verbose', 'region']);
  assert.equal('schemaVersion' in help, false);
});

test('completion distinguishes logical options from concrete flag spellings', () => {
  assert.deepEqual(
    completeCli(program, { commandPath: ['deploy'], prefix: '--r' }),
    [{ kind: 'flag', value: '--region', option: 'region' }]
  );
  assert.deepEqual(
    completeCli(program, { prefix: 'd' }).map((candidate) => [candidate.kind, candidate.value]),
    [['command', 'deploy'], ['alias', 'd']]
  );
});

test('dispatch accepts only a successful invocation and propagates handler results', async () => {
  const parser = createCliInvocationParser(() => ({
    status: 'bound',
    values: {},
    specified: {},
    positionals: ['api'],
    afterDoubleDash: [],
    unknownFlags: []
  }));
  const invocation = parser.parse(program, { argv: ['deploy', 'api'] });
  assert.equal(invocation.status, 'parsed');
  if (invocation.status !== 'parsed') return;

  const value = await dispatchCli(invocation, {
    'ship deploy': ({ invocation: parsed, context }) => `${parsed.positionalValues.service}:${context}`
  }, 'production');
  assert.equal(value, 'api:production');

  await assert.rejects(
    dispatchCli(invocation, {}, undefined),
    (error) => error instanceof CliHandlerNotFoundError && error.commandKey === 'ship deploy'
  );
});
