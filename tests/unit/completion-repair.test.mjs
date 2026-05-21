import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCompletionInstallPlan,
  createCompletionPayload,
  createCompletionScript,
  defineCli,
  parseCli,
  suggestRepairs
} from '../../dist/index.js';

const program = defineCli({
  name: 'ship',
  options: [{ name: 'verbose', type: 'boolean', flags: ['--verbose', '-v'] }],
  commands: [
    {
      name: 'deploy',
      aliases: [{ name: 'd', deprecated: 'Use deploy.' }],
      options: [{ name: 'region', type: 'string', flags: ['--region'] }],
      positionals: [{ name: 'service' }]
    }
  ]
});

test('createCompletionPayload returns command, alias, option, and positional candidates', () => {
  const root = createCompletionPayload(program);
  const deploy = createCompletionPayload(program, { commandPath: ['deploy'], word: '--' });

  assert.deepEqual(root.items.map((item) => item.value), ['deploy', 'd', '--verbose', '-v']);
  assert.deepEqual(deploy.items.map((item) => item.value), ['--verbose', '--region']);
});

test('createCompletionScript covers supported shells and install plans are data-only', () => {
  const scripts = ['bash', 'zsh', 'fish', 'pwsh'].map((shell) => createCompletionScript(program, shell));
  const plan = createCompletionInstallPlan(program, 'fish');

  assert.deepEqual(scripts.map((script) => script.shell), ['bash', 'zsh', 'fish', 'pwsh']);
  assert.match(scripts[0].script, /complete -F/);
  assert.match(scripts[1].script, /#compdef ship/);
  assert.match(scripts[2].script, /complete -c 'ship'/);
  assert.match(scripts[3].script, /Register-ArgumentCompleter/);
  assert.equal(plan.steps[0].action, 'write_file');
  assert.equal(plan.steps[1].action, 'source_file');
});

test('suggestRepairs maps invocation diagnostics to stable suggestions', () => {
  const command = suggestRepairs(parseCli(program, { argv: ['deply', 'api'] }), program);
  const missing = suggestRepairs(parseCli(program, { argv: ['deploy'] }), program);
  const deprecated = suggestRepairs(parseCli(program, { argv: ['d', 'api'] }), program);
  const unknown = suggestRepairs(parseCli(program, { argv: ['deploy', '--regin', 'api'] }), program);

  assert.equal(command[0].code, 'REPAIR_UNKNOWN_COMMAND');
  assert.deepEqual(command[0].replacement, ['deploy']);
  assert.equal(missing[0].code, 'REPAIR_MISSING_INPUT');
  assert.equal(deprecated[0].code, 'REPAIR_DEPRECATED_ALIAS');
  assert.equal(unknown[0].code, 'REPAIR_UNKNOWN_OPTION');
  assert.deepEqual(unknown[0].replacement, ['--region']);
});
