import assert from 'node:assert/strict';
import test from 'node:test';
import { defineCli, parseCli, resolveCliConfig } from '../../dist/index.js';

test('consumer can parse argv and pass option values into config resolution', () => {
  const program = defineCli({
    name: 'ship',
    config: {
      fields: [
        { name: 'profile', type: 'string', default: 'default', env: 'SHIP_PROFILE' },
        { name: 'dryRun', type: 'boolean', default: false }
      ]
    },
    commands: [
      {
        name: 'deploy',
        options: [{ name: 'profile', type: 'string', flags: ['--profile'] }]
      }
    ]
  });
  const invocation = parseCli(program, { argv: ['deploy', '--profile', 'prod'] });
  const resolution = resolveCliConfig(program, {
    env: { SHIP_PROFILE: 'env' },
    argv: invocation.options.values
  });

  assert.equal(resolution.ok, true);
  assert.deepEqual(resolution.values, { profile: 'prod', dryRun: false });
  assert.equal(resolution.explanations.find((item) => item.key === 'profile')?.selected.kind, 'argv');
});
