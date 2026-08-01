import assert from 'node:assert/strict';
import test from 'node:test';
import * as cliCore from '../support/invocation-parser.mjs';
import { testInvocationParser } from '../support/invocation-parser.mjs';
import * as testing from '../../dist/testing/index.js';

test('consumer can compile, parse, validate, and record a command scenario through public APIs', async () => {
  const program = cliCore.defineCli({
    name: 'ship',
    options: [{ name: 'verbose', type: 'boolean', flags: ['--verbose'] }],
    commands: [
      {
        name: 'deploy',
        aliases: ['d'],
        options: [{ name: 'region', type: 'string', flags: ['--region'], required: true }],
        positionals: [{ name: 'service' }]
      }
    ]
  });

  const invocation = cliCore.parseCli(program, {
    argv: ['d', '--verbose', '--region', 'eu', 'api']
  });
  const validation = await cliCore.validateCli(program, invocation);
  const harness = testing.createCliHarness({
    program,
    parser: testInvocationParser,
    entrypoints: {
      root: cliCore,
      testing
    }
  });
  const harnessResult = await testing.runCliScenario(harness, {
    id: 'acceptance.command-model',
    steps: [
      {
        kind: 'entrypoint-load',
        name: 'root exposes command APIs',
        entrypoint: 'root',
        expectedExports: ['defineCli', 'createCliInvocationParser', 'validateCli']
      },
      {
        kind: 'entrypoint-load',
        name: 'testing exposes scenario APIs',
        entrypoint: 'testing',
        expectedExports: ['createCliHarness', 'runCliScenario']
      }
    ]
  });

  assert.equal(program.diagnostics.length, 0);
  assert.equal(invocation.ok, true);
  assert.equal(validation.ok, true);
  assert.deepEqual(invocation.commandPath, ['deploy']);
  assert.deepEqual(invocation.positionals, { service: 'api' });
  assert.deepEqual(invocation.options.values, { verbose: true, region: 'eu' });
  assert.equal(harnessResult.status, 'passed');
});

test('option-binder issues are surfaced as cli-core diagnostics', () => {
  const program = cliCore.defineCli({
    name: 'ship',
    commands: [
      {
        name: 'deploy',
        options: [{ name: 'region', type: 'string', flags: ['--region'], required: true }]
      }
    ]
  });

  const invocation = cliCore.parseCli(program, { argv: ['deploy'] });

  assert.equal(invocation.ok, false);
  assert.equal(invocation.diagnostics[0].code, 'CLI_OPTION_BINDING_FAILED');
  assert.equal(invocation.diagnostics[0].fields.reason, 'REQUIRED');
});
