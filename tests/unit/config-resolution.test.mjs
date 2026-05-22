import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defineCli,
  resolveCliConfig
} from '../../dist/index.js';
import {
  createMemoryConfigDiscoveryHost,
  discoverCliConfigInput
} from '../../dist/config/index.js';

test('resolveCliConfig applies precedence and provenance', () => {
  const program = defineCli({
    name: 'ship',
    config: {
      version: '2',
      fields: [
        { name: 'mode', type: 'string', default: 'safe', env: 'SHIP_MODE' },
        { name: 'retries', type: 'number', default: 1, env: 'SHIP_RETRIES' },
        { name: 'trace', type: 'boolean', default: false }
      ]
    }
  });

  const resolution = resolveCliConfig(program, {
    workspaceDefaults: { mode: 'workspace' },
    configFiles: [{ path: '.shiprc.json', version: '2', values: { mode: 'file', retries: 2 } }],
    env: { SHIP_MODE: 'env', SHIP_RETRIES: '3' },
    argv: { mode: 'argv' }
  });

  assert.equal(resolution.ok, true);
  assert.deepEqual(resolution.values, { mode: 'argv', retries: 3, trace: false });
  assert.equal(resolution.explanations.find((item) => item.key === 'mode')?.selected.kind, 'argv');
  assert.equal(resolution.explanations.find((item) => item.key === 'retries')?.selected.kind, 'environment');
});

test('resolveCliConfig applies data migrations and deprecation diagnostics', () => {
  const program = defineCli({
    name: 'ship',
    config: {
      version: '2',
      fields: [
        { name: 'region', type: 'string' },
        { name: 'legacy', type: 'string', deprecated: 'Use region.' }
      ],
      migrations: [{ from: '1', to: '2', rename: { zone: 'region' }, defaults: { legacy: 'old' } }]
    }
  });

  const resolution = resolveCliConfig(program, {
    configFiles: [{ path: 'ship.v1.json', version: '1', values: { zone: 'eu' } }]
  });

  assert.equal(resolution.values.region, 'eu');
  assert.equal(resolution.values.legacy, 'old');
  assert.equal(resolution.diagnostics[0].code, 'CLI_CONFIG_FIELD_DEPRECATED');
  assert.equal(resolution.diagnostics[0].severity, 'warning');
});

test('resolveCliConfig records discovery scope without reading files', () => {
  const program = defineCli({ name: 'ship', config: { fields: [] } });
  const resolution = resolveCliConfig(program, {
    discovery: {
      scope: 'explicit_paths',
      cwd: '/workspace',
      explicitPaths: ['a.json', 'b.json']
    }
  });

  assert.deepEqual(resolution.discovery, {
    scope: 'explicit_paths',
    cwd: '/workspace',
    searchedPaths: ['a.json', 'b.json']
  });
});

test('discoverCliConfigInput collects explicit files and env through a host', async () => {
  const program = defineCli({
    name: 'ship',
    config: {
      fields: [
        { name: 'profile', type: 'string', default: 'default', env: 'SHIP_PROFILE' },
        { name: 'retries', type: 'number', default: 1, env: 'SHIP_RETRIES' }
      ]
    }
  });
  const memory = createMemoryConfigDiscoveryHost({
    files: {
      '/repo/a.json': { profile: 'file-a' },
      '/repo/b.json': { profile: 'file-b' }
    },
    env: {
      SHIP_PROFILE: 'env',
      SHIP_RETRIES: '4'
    }
  });

  const collection = await discoverCliConfigInput(program, {
    host: memory.host,
    scope: 'explicit_paths',
    explicitPaths: ['/repo/a.json', '/repo/b.json'],
    environment: { includeConfigFields: true }
  });
  const resolution = resolveCliConfig(program, collection.input);

  assert.equal(collection.ok, true);
  assert.deepEqual(collection.discovery.searchedPaths, ['/repo/a.json', '/repo/b.json']);
  assert.deepEqual(collection.files.map((file) => file.path), ['/repo/a.json', '/repo/b.json']);
  assert.equal(collection.env.SHIP_PROFILE, 'env');
  assert.equal(resolution.values.profile, 'env');
  assert.equal(resolution.values.retries, 4);
  assert.equal(resolution.explanations.find((item) => item.key === 'profile')?.selected.kind, 'environment');
});

test('discoverCliConfigInput walks cwd to root and stops at the boundary', async () => {
  const program = defineCli({
    name: 'ship',
    config: { fields: [{ name: 'profile', type: 'string', default: 'default' }] }
  });
  const memory = createMemoryConfigDiscoveryHost({
    files: {
      '/repo/.shiprc.json': { profile: 'root' },
      '/repo/packages/.shiprc.json': { profile: 'package' },
      '/repo/packages/app/.shiprc.json': { profile: 'app' },
      '/.shiprc.json': { profile: 'outside' }
    }
  });

  const collection = await discoverCliConfigInput(program, {
    host: memory.host,
    scope: 'cwd_to_root',
    cwd: '/repo/packages/app',
    root: '/repo',
    filenames: ['.shiprc.json']
  });
  const resolution = resolveCliConfig(program, collection.input);

  assert.deepEqual(collection.discovery.searchedPaths, [
    '/repo/packages/app/.shiprc.json',
    '/repo/packages/.shiprc.json',
    '/repo/.shiprc.json'
  ]);
  assert.deepEqual(collection.files.map((file) => file.path), [
    '/repo/.shiprc.json',
    '/repo/packages/.shiprc.json',
    '/repo/packages/app/.shiprc.json'
  ]);
  assert.equal(resolution.values.profile, 'app');
});

test('discoverCliConfigInput reports malformed config files as diagnostics', async () => {
  const program = defineCli({ name: 'ship', config: { fields: [] } });
  const memory = createMemoryConfigDiscoveryHost({
    files: { '/repo/bad.json': '{' }
  });

  const collection = await discoverCliConfigInput(program, {
    host: memory.host,
    scope: 'explicit_paths',
    explicitPaths: ['/repo/bad.json']
  });

  assert.equal(collection.ok, false);
  assert.equal(collection.files.length, 0);
  assert.equal(collection.diagnostics[0].code, 'CLI_CONFIG_FILE_INVALID');
  assert.equal(collection.diagnostics[0].fields.path, '/repo/bad.json');
});

test('resolveCliConfig remains pure with respect to ambient environment', async () => {
  const previous = process.env.SHIP_PROFILE;
  process.env.SHIP_PROFILE = 'ambient';
  try {
    const program = defineCli({
      name: 'ship',
      config: { fields: [{ name: 'profile', type: 'string', default: 'default', env: 'SHIP_PROFILE' }] }
    });
    const memory = createMemoryConfigDiscoveryHost({ env: { SHIP_PROFILE: 'host' } });
    const withoutEnv = await discoverCliConfigInput(program, { host: memory.host, scope: 'none' });
    const withEnv = await discoverCliConfigInput(program, {
      host: memory.host,
      scope: 'none',
      environment: { includeConfigFields: true }
    });

    assert.equal(resolveCliConfig(program).values.profile, 'default');
    assert.equal(resolveCliConfig(program, withoutEnv.input).values.profile, 'default');
    assert.equal(resolveCliConfig(program, withEnv.input).values.profile, 'host');
  } finally {
    if (previous === undefined) {
      delete process.env.SHIP_PROFILE;
    } else {
      process.env.SHIP_PROFILE = previous;
    }
  }
});
