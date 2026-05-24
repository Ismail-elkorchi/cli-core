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

test('resolveCliConfig explains discovery from config file paths when searched paths are omitted', () => {
  const program = defineCli({ name: 'ship', config: { fields: [] } });
  const resolution = resolveCliConfig(program, {
    configFiles: [
      { path: '/repo/.shiprc.json', values: {} },
      { path: '/repo/packages/app/.shiprc.json', values: {} }
    ],
    discovery: { scope: 'cwd_only' }
  });

  assert.deepEqual(resolution.discovery, {
    scope: 'cwd_only',
    cwd: undefined,
    searchedPaths: ['/repo/.shiprc.json', '/repo/packages/app/.shiprc.json']
  });
});

test('discoverCliConfigInput defaults to no discovery and reads no ambient sources', async () => {
  const program = defineCli({ name: 'ship', config: { fields: [{ name: 'profile', type: 'string', env: 'SHIP_PROFILE' }] } });
  const host = {
    readTextFile: () => {
      throw new Error('readTextFile should not be called');
    },
    readEnv: () => {
      throw new Error('readEnv should not be called');
    }
  };

  const collection = await discoverCliConfigInput(program, { host });

  assert.equal(collection.ok, true);
  assert.deepEqual(collection.discovery.searchedPaths, []);
  assert.deepEqual(collection.files, []);
  assert.deepEqual(collection.env, {});
});

test('discoverCliConfigInput keeps explicit empty paths empty', async () => {
  const program = defineCli({ name: 'ship', config: { fields: [] } });
  const host = {
    readTextFile: () => {
      throw new Error('readTextFile should not be called');
    }
  };

  const collection = await discoverCliConfigInput(program, {
    host,
    scope: 'explicit_paths'
  });

  assert.equal(collection.ok, true);
  assert.deepEqual(collection.discovery.searchedPaths, []);
  assert.deepEqual(collection.files, []);
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
    environment: { includeConfigFields: true },
    workspaceDefaults: { profile: 'workspace' },
    argv: { profile: 'argv' }
  });
  const resolution = resolveCliConfig(program, collection.input);

  assert.equal(collection.ok, true);
  assert.deepEqual(collection.discovery.searchedPaths, ['/repo/a.json', '/repo/b.json']);
  assert.deepEqual(collection.files.map((file) => file.path), ['/repo/a.json', '/repo/b.json']);
  assert.equal(collection.input.discovery.cwd, undefined);
  assert.deepEqual(collection.input.discovery.explicitPaths, ['/repo/a.json', '/repo/b.json']);
  assert.equal(collection.env.SHIP_PROFILE, 'env');
  assert.deepEqual(collection.input.workspaceDefaults, { profile: 'workspace' });
  assert.deepEqual(collection.input.argv, { profile: 'argv' });
  assert.equal(resolution.values.profile, 'argv');
  assert.equal(resolution.values.retries, 4);
  assert.equal(resolution.explanations.find((item) => item.key === 'profile')?.selected.kind, 'argv');
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

test('discoverCliConfigInput walks to filesystem root when root is omitted', async () => {
  const program = defineCli({
    name: 'ship',
    config: { fields: [{ name: 'profile', type: 'string', default: 'default' }] }
  });
  const memory = createMemoryConfigDiscoveryHost({
    files: {
      '/.shiprc.json': { profile: 'filesystem' },
      '/repo/.shiprc.json': { profile: 'repo' },
      '/repo/app/.shiprc.json': { profile: 'app' }
    }
  });

  const collection = await discoverCliConfigInput(program, {
    host: memory.host,
    scope: 'cwd_to_root',
    cwd: '/repo/app',
    filenames: ['.shiprc.json']
  });
  const resolution = resolveCliConfig(program, collection.input);

  assert.deepEqual(collection.discovery.searchedPaths, [
    '/repo/app/.shiprc.json',
    '/repo/.shiprc.json',
    '/.shiprc.json'
  ]);
  assert.equal(resolution.values.profile, 'app');
});

test('discoverCliConfigInput treats missing files as non-errors', async () => {
  const program = defineCli({ name: 'ship', config: { fields: [] } });
  const host = {
    readTextFile: () => undefined
  };

  const collection = await discoverCliConfigInput(program, {
    host,
    scope: 'explicit_paths',
    explicitPaths: ['/repo/missing.json']
  });

  assert.equal(collection.ok, true);
  assert.deepEqual(collection.discovery.searchedPaths, ['/repo/missing.json']);
  assert.deepEqual(collection.files, []);
  assert.deepEqual(collection.diagnostics, []);
});

test('discoverCliConfigInput uses sanitized default filenames in cwd_only scope', async () => {
  const program = defineCli({
    name: 'ship tools',
    config: { fields: [{ name: 'profile', type: 'string', default: 'default' }] }
  });
  const memory = createMemoryConfigDiscoveryHost({
    files: {
      '/repo/.ship-toolsrc.json': { profile: 'rc' },
      '/repo/ship-tools.config.json': { profile: 'config' }
    }
  });

  const collection = await discoverCliConfigInput(program, {
    host: memory.host,
    scope: 'cwd_only',
    cwd: '/repo/'
  });
  const resolution = resolveCliConfig(program, collection.input);

  assert.deepEqual(collection.discovery.searchedPaths, [
    '/repo/.ship-toolsrc.json',
    '/repo/ship-tools.config.json'
  ]);
  assert.deepEqual(collection.files.map((file) => file.path), [
    '/repo/.ship-toolsrc.json',
    '/repo/ship-tools.config.json'
  ]);
  assert.equal(resolution.values.profile, 'config');
});

test('discoverCliConfigInput normalizes traversal and de-duplicates generated candidates', async () => {
  const program = defineCli({
    name: 'ship',
    config: { fields: [{ name: 'profile', type: 'string', default: 'default' }] }
  });
  const memory = createMemoryConfigDiscoveryHost({
    files: {
      '/repo/.shiprc.json': { profile: 'root' },
      '/repo/packages/.shiprc.json': { profile: 'package' },
      '/repo/packages/app/.shiprc.json': { profile: 'app' }
    }
  });

  const collection = await discoverCliConfigInput(program, {
    host: memory.host,
    scope: 'cwd_to_root',
    cwd: '/repo/packages/app/../app/',
    root: '/repo/./',
    filenames: ['.shiprc.json', '.shiprc.json']
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

test('discoverCliConfigInput preserves absolute filenames without repeating them for each ancestor', async () => {
  const program = defineCli({
    name: 'ship',
    config: { fields: [{ name: 'profile', type: 'string', default: 'default' }] }
  });
  const memory = createMemoryConfigDiscoveryHost({
    files: {
      '/etc/ship.json': { profile: 'system' }
    }
  });

  const collection = await discoverCliConfigInput(program, {
    host: memory.host,
    scope: 'cwd_to_root',
    cwd: '/repo/packages/app',
    root: '/repo',
    filenames: ['/etc/ship.json']
  });
  const resolution = resolveCliConfig(program, collection.input);

  assert.deepEqual(collection.discovery.searchedPaths, ['/etc/ship.json']);
  assert.deepEqual(collection.files.map((file) => file.path), ['/etc/ship.json']);
  assert.equal(resolution.values.profile, 'system');
});

test('discoverCliConfigInput preserves Windows absolute filenames', async () => {
  const program = defineCli({
    name: 'ship',
    config: { fields: [{ name: 'profile', type: 'string', default: 'default' }] }
  });
  const memory = createMemoryConfigDiscoveryHost({
    files: {
      'C:\\etc\\ship.json': { profile: 'system' }
    }
  });

  const collection = await discoverCliConfigInput(program, {
    host: memory.host,
    scope: 'cwd_to_root',
    cwd: 'C:\\repo\\app',
    root: 'C:\\repo',
    filenames: ['C:\\etc\\ship.json']
  });
  const resolution = resolveCliConfig(program, collection.input);

  assert.deepEqual(collection.discovery.searchedPaths, ['C:/etc/ship.json']);
  assert.equal(resolution.values.profile, 'system');
});

test('discoverCliConfigInput falls back when host path helpers are omitted', async () => {
  const program = defineCli({
    name: 'ship',
    config: { fields: [{ name: 'profile', type: 'string', default: 'default' }] }
  });
  const files = new Map([
    ['/workspace/.shiprc.json', JSON.stringify({ profile: 'workspace' })],
    ['/workspace/app/.shiprc.json', JSON.stringify({ profile: 'app' })]
  ]);
  const host = {
    readTextFile: (path) => files.get(path)
  };

  const collection = await discoverCliConfigInput(program, {
    host,
    scope: 'cwd_to_root',
    cwd: '/workspace/app',
    root: '/workspace',
    filenames: ['.shiprc.json']
  });
  const resolution = resolveCliConfig(program, collection.input);

  assert.deepEqual(collection.discovery.searchedPaths, [
    '/workspace/app/.shiprc.json',
    '/workspace/.shiprc.json'
  ]);
  assert.equal(resolution.values.profile, 'app');
});

test('discoverCliConfigInput stops when a host dirname returns no parent', async () => {
  const program = defineCli({
    name: 'ship',
    config: { fields: [{ name: 'profile', type: 'string', default: 'default' }] }
  });
  const files = new Map([
    ['/virtual/app/.shiprc.json', JSON.stringify({ profile: 'app' })]
  ]);
  const host = {
    readTextFile: (path) => files.get(path),
    joinPath: (directory, filename) => `${directory}/${filename}`,
    dirname: () => undefined
  };

  const collection = await discoverCliConfigInput(program, {
    host,
    scope: 'cwd_to_root',
    cwd: '/virtual/app',
    filenames: ['.shiprc.json']
  });
  const resolution = resolveCliConfig(program, collection.input);

  assert.deepEqual(collection.discovery.searchedPaths, ['/virtual/app/.shiprc.json']);
  assert.equal(resolution.values.profile, 'app');
});

test('discoverCliConfigInput normalizes Windows-style host paths', async () => {
  const program = defineCli({
    name: 'ship',
    config: { fields: [{ name: 'profile', type: 'string', default: 'default' }] }
  });
  const files = new Map([
    ['C:/repo/.shiprc.json', JSON.stringify({ profile: 'root' })],
    ['C:/repo/packages/.shiprc.json', JSON.stringify({ profile: 'package' })],
    ['C:/repo/packages/app/.shiprc.json', JSON.stringify({ profile: 'app' })]
  ]);
  const host = {
    readTextFile: (path) => files.get(path),
    joinPath: (directory, filename) => `${directory}\\${filename}`,
    dirname: (path) => path.replaceAll('/', '\\').replace(/\\[^\\]+$/u, '')
  };

  const collection = await discoverCliConfigInput(program, {
    host,
    scope: 'cwd_to_root',
    cwd: 'C:\\repo\\packages\\app',
    root: 'C:\\repo',
    filenames: ['.shiprc.json']
  });
  const resolution = resolveCliConfig(program, collection.input);

  assert.deepEqual(collection.discovery.searchedPaths, [
    'C:/repo/packages/app/.shiprc.json',
    'C:/repo/packages/.shiprc.json',
    'C:/repo/.shiprc.json'
  ]);
  assert.equal(resolution.values.profile, 'app');
});

test('discoverCliConfigInput walks Windows drive roots when root is omitted', async () => {
  const program = defineCli({
    name: 'ship',
    config: { fields: [{ name: 'profile', type: 'string', default: 'default' }] }
  });
  const files = new Map([
    ['C:/.shiprc.json', JSON.stringify({ profile: 'drive' })],
    ['C:/repo/.shiprc.json', JSON.stringify({ profile: 'repo' })],
    ['C:/repo/app/.shiprc.json', JSON.stringify({ profile: 'app' })]
  ]);
  const host = {
    readTextFile: (path) => files.get(path),
    joinPath: (directory, filename) => `${directory}\\${filename}`
  };

  const collection = await discoverCliConfigInput(program, {
    host,
    scope: 'cwd_to_root',
    cwd: 'C:\\repo\\app',
    filenames: ['.shiprc.json']
  });
  const resolution = resolveCliConfig(program, collection.input);

  assert.deepEqual(collection.discovery.searchedPaths, [
    'C:/repo/app/.shiprc.json',
    'C:/repo/.shiprc.json',
    'C:/.shiprc.json'
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
  assert.equal(collection.diagnostics[0].message, 'Config file is not valid JSON.');
  assert.equal(typeof collection.diagnostics[0].fields.error, 'string');
});

test('discoverCliConfigInput reports host read failures as discovery diagnostics', async () => {
  const program = defineCli({ name: 'ship', config: { fields: [] } });
  const host = {
    readTextFile: () => {
      throw new Error('disk unavailable');
    }
  };

  const collection = await discoverCliConfigInput(program, {
    host,
    scope: 'explicit_paths',
    explicitPaths: ['/repo/.shiprc.json']
  });

  assert.equal(collection.ok, false);
  assert.equal(collection.files.length, 0);
  assert.equal(collection.diagnostics[0].code, 'CLI_CONFIG_DISCOVERY_FAILED');
  assert.equal(collection.diagnostics[0].severity, 'error');
  assert.equal(collection.diagnostics[0].fields.path, '/repo/.shiprc.json');
  assert.match(String(collection.diagnostics[0].fields.error), /disk unavailable/);
});

test('discoverCliConfigInput reports non-object config files as invalid', async () => {
  const program = defineCli({ name: 'ship', config: { fields: [] } });
  const memory = createMemoryConfigDiscoveryHost({
    files: { '/repo/bad.json': '[]' }
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

test('discoverCliConfigInput reports null config files as invalid', async () => {
  const program = defineCli({ name: 'ship', config: { fields: [] } });
  const memory = createMemoryConfigDiscoveryHost({
    files: { '/repo/null.json': 'null' }
  });

  const collection = await discoverCliConfigInput(program, {
    host: memory.host,
    scope: 'explicit_paths',
    explicitPaths: ['/repo/null.json']
  });

  assert.equal(collection.ok, false);
  assert.equal(collection.files.length, 0);
  assert.equal(collection.diagnostics[0].code, 'CLI_CONFIG_FILE_INVALID');
});

test('discoverCliConfigInput excludes top-level version from plain config values', async () => {
  const program = defineCli({ name: 'ship', config: { fields: [{ name: 'profile', type: 'string' }] } });
  const memory = createMemoryConfigDiscoveryHost({
    files: {
      '/repo/config.json': {
        version: '4',
        profile: 'plain'
      }
    }
  });

  const collection = await discoverCliConfigInput(program, {
    host: memory.host,
    scope: 'explicit_paths',
    explicitPaths: ['/repo/config.json']
  });

  assert.equal(collection.ok, true);
  assert.equal(collection.files[0].version, '4');
  assert.deepEqual(collection.files[0].values, { profile: 'plain' });
});

test('discoverCliConfigInput ignores non-string top-level config versions', async () => {
  const program = defineCli({ name: 'ship', config: { fields: [{ name: 'profile', type: 'string' }] } });
  const memory = createMemoryConfigDiscoveryHost({
    files: {
      '/repo/config.json': '{"version":2,"profile":"plain"}'
    }
  });

  const collection = await discoverCliConfigInput(program, {
    host: memory.host,
    scope: 'explicit_paths',
    explicitPaths: ['/repo/config.json']
  });

  assert.equal(collection.ok, true);
  assert.equal(Object.hasOwn(collection.files[0], 'version'), false);
  assert.deepEqual(collection.files[0].values, { profile: 'plain' });
});

test('discoverCliConfigInput preserves versioned values envelopes and nested config values', async () => {
  const program = defineCli({
    name: 'ship',
    config: {
      fields: [
        { name: 'profile', type: 'string' },
        { name: 'features', type: 'object' },
        { name: 'tags', type: 'array' },
        { name: 'empty', type: 'object' }
      ]
    }
  });
  const memory = createMemoryConfigDiscoveryHost({
    files: {
      '/repo/config.json': {
        version: '2',
        values: {
          profile: 'file',
          features: { deploy: true, nested: { level: 2 } },
          tags: ['stable', 'ci'],
          empty: null
        }
      }
    }
  });

  const collection = await discoverCliConfigInput(program, {
    host: memory.host,
    scope: 'explicit_paths',
    explicitPaths: ['/repo/config.json']
  });

  assert.equal(collection.ok, true);
  assert.equal(collection.files[0].version, '2');
  assert.deepEqual(collection.files[0].values, {
    profile: 'file',
    features: { deploy: true, nested: { level: 2 } },
    tags: ['stable', 'ci'],
    empty: null
  });
});

test('discoverCliConfigInput omits version on unversioned config files', async () => {
  const program = defineCli({ name: 'ship', config: { fields: [{ name: 'profile', type: 'string' }] } });
  const memory = createMemoryConfigDiscoveryHost({
    files: {
      '/repo/config.json': { profile: 'plain' }
    }
  });

  const collection = await discoverCliConfigInput(program, {
    host: memory.host,
    scope: 'explicit_paths',
    explicitPaths: ['/repo/config.json']
  });

  assert.equal(collection.ok, true);
  assert.equal(Object.hasOwn(collection.files[0], 'version'), false);
  assert.deepEqual(collection.files[0].values, { profile: 'plain' });
});

test('discoverCliConfigInput rejects unsupported config value types', async () => {
  const program = defineCli({ name: 'ship', config: { fields: [] } });
  const memory = createMemoryConfigDiscoveryHost({
    files: { '/repo/bad.json': { profile: ['one', 2] } }
  });

  const collection = await discoverCliConfigInput(program, {
    host: memory.host,
    scope: 'explicit_paths',
    explicitPaths: ['/repo/bad.json']
  });

  assert.equal(collection.ok, false);
  assert.equal(collection.files.length, 0);
  assert.equal(collection.diagnostics[0].code, 'CLI_CONFIG_FILE_INVALID');
});

test('discoverCliConfigInput rejects mixed valid and invalid nested config values', async () => {
  const program = defineCli({ name: 'ship', config: { fields: [] } });
  const memory = createMemoryConfigDiscoveryHost({
    files: {
      '/repo/bad.json': {
        profile: 'valid',
        nested: { ok: true, bad: ['one', 2] }
      }
    }
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

test('discoverCliConfigInput captures explicit env names and reports env host failures', async () => {
  const program = defineCli({
    name: 'ship',
    config: {
      fields: [
        { name: 'profile', type: 'string', env: 'SHIP_PROFILE' },
        { name: 'localOnly', type: 'string' }
      ]
    }
  });
  const memory = createMemoryConfigDiscoveryHost({
    env: {
      SHIP_PROFILE: 'field',
      SHIP_TOKEN: 'token'
    }
  });
  const collection = await discoverCliConfigInput(program, {
    host: memory.host,
    scope: 'none',
    environment: { names: ['SHIP_TOKEN'] }
  });
  const failing = await discoverCliConfigInput(program, {
    host: {
      readTextFile: () => undefined,
      readEnv: () => {
        throw new Error('env unavailable');
      }
    },
    scope: 'none',
    environment: { includeConfigFields: true }
  });
  const noReader = await discoverCliConfigInput(program, {
    host: { readTextFile: () => undefined },
    scope: 'none',
    environment: { names: ['SHIP_TOKEN'] }
  });

  assert.deepEqual(collection.env, { SHIP_TOKEN: 'token' });
  assert.deepEqual(noReader.env, {});
  assert.equal(noReader.ok, true);
  assert.equal(failing.ok, false);
  assert.deepEqual(failing.env, {});
  assert.equal(failing.diagnostics[0].code, 'CLI_CONFIG_DISCOVERY_FAILED');
  assert.match(String(failing.diagnostics[0].fields.error), /env unavailable/);
});

test('discoverCliConfigInput requests only defined config field env names', async () => {
  const program = defineCli({
    name: 'ship',
    config: {
      fields: [
        { name: 'profile', type: 'string', env: 'SHIP_PROFILE' },
        { name: 'localOnly', type: 'string' }
      ]
    }
  });
  const requested = [];
  const collection = await discoverCliConfigInput(program, {
    host: {
      readTextFile: () => undefined,
      readEnv: (names) => {
        requested.push(...names);
        return Object.fromEntries(names.map((name) => [name, 'value']));
      }
    },
    scope: 'none',
    environment: { includeConfigFields: true }
  });
  const noConfig = await discoverCliConfigInput(defineCli({ name: 'empty' }), {
    host: {
      readTextFile: () => undefined,
      readEnv: () => {
        throw new Error('readEnv should not be called without names');
      }
    },
    scope: 'none',
    environment: { includeConfigFields: true }
  });

  assert.deepEqual(requested, ['SHIP_PROFILE']);
  assert.deepEqual(collection.env, { SHIP_PROFILE: 'value' });
  assert.equal(noConfig.ok, true);
  assert.deepEqual(noConfig.env, {});
});

test('createMemoryConfigDiscoveryHost exposes normalized immutable snapshots', () => {
  const memory = createMemoryConfigDiscoveryHost({
    files: {
      'C:\\repo\\config.json': {
        path: 'ignored-input-path.json',
        version: '3',
        values: { profile: 'file' }
      },
      '/repo/no-version.json': {
        path: 'ignored-no-version.json',
        values: { profile: 'no-version' }
      },
      '/repo/raw-path-key.json': {
        path: 'literal-config-value',
        profile: 'raw'
      }
    },
    env: { SHIP_PROFILE: 'memory' }
  });

  assert.deepEqual(Object.keys(memory.files()), [
    'C:/repo/config.json',
    '/repo/no-version.json',
    '/repo/raw-path-key.json'
  ]);
  assert.deepEqual(JSON.parse(memory.files()['C:/repo/config.json']), {
    version: '3',
    values: { profile: 'file' }
  });
  assert.deepEqual(JSON.parse(memory.files()['/repo/no-version.json']), {
    values: { profile: 'no-version' }
  });
  assert.deepEqual(JSON.parse(memory.files()['/repo/raw-path-key.json']), {
    path: 'literal-config-value',
    profile: 'raw'
  });
  assert.deepEqual(memory.env(), { SHIP_PROFILE: 'memory' });
  assert.throws(() => {
    memory.files()['/other.json'] = '{}';
  }, TypeError);
  assert.throws(() => {
    memory.env().SHIP_PROFILE = 'mutated';
  }, TypeError);
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
