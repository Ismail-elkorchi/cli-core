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

test('consumer can derive completion payloads, scripts, install plans, and repair suggestions', () => {
  const program = defineCli({
    name: 'ship',
    options: [{ name: 'verbose', type: 'boolean', flags: ['--verbose', '-v'] }],
    commands: [
      {
        name: 'deploy',
        aliases: ['d'],
        description: 'Deploy a service.',
        options: [{ name: 'region', type: 'string', flags: ['--region'] }],
        positionals: [{ name: 'service' }]
      }
    ]
  });

  const completion = createCompletionPayload(program, { word: 'd' });
  const script = createCompletionScript(program, 'zsh');
  const plan = createCompletionInstallPlan(program, 'pwsh');
  const invocation = parseCli(program, { argv: ['deply', 'api'] });
  const repairs = suggestRepairs(invocation, program);

  assert.deepEqual(completion.items.map((item) => item.value), ['deploy', 'd']);
  assert.match(script.script, /#compdef ship/);
  assert.equal(plan.steps[0].action, 'write_file');
  assert.equal(repairs[0].code, 'REPAIR_UNKNOWN_COMMAND');
  assert.deepEqual(repairs[0].replacement, ['deploy']);
});
