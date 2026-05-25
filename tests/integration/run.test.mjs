import assert from 'node:assert/strict';
import test from 'node:test';
import { defineCli, parseCli, runCli } from '../../dist/index.js';

test('consumer can parse an invocation and run it through plan and apply modes', async () => {
  const program = defineCli({
    name: 'ship',
    commands: [{ name: 'deploy', positionals: [{ name: 'service' }] }]
  });
  const invocation = parseCli(program, { argv: ['deploy', 'api'] });
  const plan = await runCli(program, {
    mode: 'plan',
    invocation,
    effects: [{ kind: 'spawn', command: 'ship', argv: ['deploy', 'api'] }]
  });
  const apply = await runCli(program, {
    mode: 'apply',
    invocation,
    handlers: {
      deploy: () => ({
        artifacts: [{ id: 'summary', kind: 'json', payload: { deployed: true } }]
      })
    }
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.effects[0].kind, 'spawn');
  assert.equal(apply.ok, true);
  assert.equal(apply.artifacts[0].id, 'summary');
  assert.deepEqual(apply.events.map((event) => event.name), [
    'parse.completed',
    'run.started',
    'run.planned',
    'effects.planned',
    'run.applied',
    'run.completed'
  ]);
});
