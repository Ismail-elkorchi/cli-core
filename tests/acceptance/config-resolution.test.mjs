import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defineCli,
  parseCli,
  resolveCliConfig
} from '../../dist/index.js';
import {
  createMemoryConfigDiscoveryHost,
  discoverCliConfigInput
} from '../../dist/config/index.js';

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

test('consumer can discover config inputs through an explicit memory host', async () => {
  const program = defineCli({
    name: 'ship',
    config: {
      fields: [
        { name: 'profile', type: 'string', default: 'default', env: 'SHIP_PROFILE' },
        { name: 'dryRun', type: 'boolean', default: false, env: 'SHIP_DRY_RUN' }
      ]
    }
  });
  const memory = createMemoryConfigDiscoveryHost({
    files: { '/workspace/.shiprc.json': { profile: 'file' } },
    env: { SHIP_PROFILE: 'env', SHIP_DRY_RUN: 'true' }
  });
  const collection = await discoverCliConfigInput(program, {
    host: memory.host,
    scope: 'cwd_only',
    cwd: '/workspace',
    filenames: ['.shiprc.json'],
    environment: { includeConfigFields: true }
  });
  const resolution = resolveCliConfig(program, collection.input);

  assert.equal(collection.ok, true);
  assert.equal(resolution.values.profile, 'env');
  assert.equal(resolution.values.dryRun, true);
  assert.equal(resolution.entries.find((entry) => entry.key === 'profile')?.source.kind, 'environment');
  assert.deepEqual(resolution.discovery.searchedPaths, ['/workspace/.shiprc.json']);
});
