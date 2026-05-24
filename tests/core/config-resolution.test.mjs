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
  assert.deepEqual(resolution.entries.map((item) => [item.key, item.source.kind, item.source.precedence]), [
    ['mode', 'argv', 4],
    ['retries', 'environment', 3],
    ['trace', 'built_in_default', 0]
  ]);
  assert.deepEqual(
    resolution.explanations.find((item) => item.key === 'mode')?.candidates.map((source) => source.kind),
    ['built_in_default', 'workspace_default', 'config_file', 'environment', 'argv']
  );
  assert.deepEqual(
    resolution.explanations.find((item) => item.key === 'mode')?.candidates.map((source) => source.label),
    ['built-in default', 'workspace default', '.shiprc.json', 'SHIP_MODE', 'argv']
  );
  assert.equal(resolution.explanations.find((item) => item.key === 'mode')?.selected.kind, 'argv');
  assert.equal(resolution.explanations.find((item) => item.key === 'mode')?.selected.label, 'argv');
  assert.equal(resolution.explanations.find((item) => item.key === 'retries')?.selected.kind, 'environment');
  assert.equal(resolution.explanations.find((item) => item.key === 'trace')?.selected.kind, 'built_in_default');
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
  assert.deepEqual(resolution.diagnostics[0].fields, { field: 'legacy', reason: 'Use region.' });
});

test('resolveCliConfig validates layer keys and value types before selection', () => {
  const program = defineCli({
    name: 'ship',
    config: {
      fields: [
        { name: 'mode', type: 'string' },
        { name: 'retries', type: 'number' },
        { name: 'enabled', type: 'boolean' },
        { name: 'tags', type: 'array' },
        { name: 'metadata', type: 'object' },
        { name: 'settings', type: 'object' },
        { name: 'matrix', type: 'object' },
        { name: 'objectText', type: 'object' },
        { name: 'mixed', type: 'object' }
      ]
    }
  });
  const unsafeArgv = Object.fromEntries([
    ['__proto__', 'polluted'],
    ['enabled', 'true'],
    ['retries', Number.NaN],
    ['tags', [1, 'stable']],
    ['settings', null],
    ['matrix', []],
    ['objectText', 'text'],
    ['mixed', { ok: 'yes', bad: ['one', 2] }]
  ]);

  const resolution = resolveCliConfig(program, {
    workspaceDefaults: { mode: 3 },
    configFiles: [{ path: 'ship.json', values: { unknown: 'value', metadata: { owner: 'ops' } } }],
    argv: unsafeArgv
  });

  assert.equal(resolution.ok, false);
  assert.deepEqual(resolution.values, { metadata: { owner: 'ops' } });
  assert.equal(Object.prototype.polluted, undefined);
  assert.deepEqual(resolution.diagnostics.map((diagnostic) => diagnostic.code), [
    'CLI_CONFIG_VALUE_INVALID',
    'CLI_CONFIG_KEY_UNKNOWN',
    'CLI_CONFIG_KEY_UNKNOWN',
    'CLI_CONFIG_VALUE_INVALID',
    'CLI_CONFIG_VALUE_INVALID',
    'CLI_CONFIG_VALUE_INVALID',
    'CLI_CONFIG_VALUE_INVALID',
    'CLI_CONFIG_VALUE_INVALID',
    'CLI_CONFIG_VALUE_INVALID',
    'CLI_CONFIG_VALUE_INVALID'
  ]);
  assert.deepEqual(resolution.diagnostics.map((diagnostic) => diagnostic.fields.field ?? diagnostic.fields.key), [
    'mode',
    'unknown',
    '__proto__',
    'enabled',
    'retries',
    'tags',
    'settings',
    'matrix',
    'objectText',
    'mixed'
  ]);
  assert.deepEqual(resolution.diagnostics.map((diagnostic) => diagnostic.fields.actualType ?? diagnostic.fields.path), [
    'number',
    'ship.json',
    '',
    'string',
    'nan',
    'array',
    'null',
    'array',
    'string',
    'object'
  ]);
  assert.deepEqual(resolution.diagnostics.map((diagnostic) => diagnostic.severity), [
    'error',
    'error',
    'error',
    'error',
    'error',
    'error',
    'error',
    'error',
    'error',
    'error'
  ]);
  assert.equal(resolution.diagnostics[0].fields.path, '');
});

test('resolveCliConfig accepts valid non-env layer values by declared type', () => {
  const program = defineCli({
    name: 'ship',
    config: {
      fields: [
        { name: 'enabled', type: 'boolean' },
        { name: 'retries', type: 'number' },
        { name: 'tags', type: 'array' },
        { name: 'metadata', type: 'object' }
      ]
    }
  });

  const resolution = resolveCliConfig(program, {
    workspaceDefaults: {
      enabled: true,
      retries: 3,
      tags: ['stable', 'ci'],
      metadata: {
        owner: 'ops',
        enabled: true,
        retries: 3,
        empty: null,
        nested: { region: 'eu' },
        labels: ['api', 'worker']
      }
    }
  });

  assert.equal(resolution.ok, true);
  assert.deepEqual(resolution.values, {
    enabled: true,
    retries: 3,
    tags: ['stable', 'ci'],
    metadata: {
      owner: 'ops',
      enabled: true,
      retries: 3,
      empty: null,
      nested: { region: 'eu' },
      labels: ['api', 'worker']
    }
  });
  assert.deepEqual(resolution.entries.map((item) => item.source.kind), [
    'workspace_default',
    'workspace_default',
    'workspace_default',
    'workspace_default'
  ]);
});

test('resolveCliConfig coerces valid environment values by declared type', () => {
  const program = defineCli({
    name: 'ship',
    config: {
      fields: [
        { name: 'enabled', type: 'boolean', env: 'SHIP_ENABLED' },
        { name: 'disabled', type: 'boolean', env: 'SHIP_DISABLED' },
        { name: 'offText', type: 'boolean', env: 'SHIP_OFF_TEXT' },
        { name: 'retries', type: 'number', env: 'SHIP_RETRIES' },
        { name: 'tags', type: 'array', env: 'SHIP_TAGS' },
        { name: 'emptyTags', type: 'array', env: 'SHIP_EMPTY_TAGS' },
        { name: 'metadata', type: 'object', env: 'SHIP_METADATA' }
      ]
    }
  });

  const resolution = resolveCliConfig(program, {
    env: {
      SHIP_ENABLED: 'true',
      SHIP_DISABLED: '0',
      SHIP_OFF_TEXT: 'false',
      SHIP_RETRIES: '4.5',
      SHIP_TAGS: 'stable,ci',
      SHIP_EMPTY_TAGS: '',
      SHIP_METADATA: '{"owner":"ops","nested":{"enabled":true}}'
    }
  });

  assert.equal(resolution.ok, true);
  assert.deepEqual(resolution.values, {
    enabled: true,
    disabled: false,
    offText: false,
    retries: 4.5,
    tags: ['stable', 'ci'],
    emptyTags: [],
    metadata: { owner: 'ops', nested: { enabled: true } }
  });
  assert.deepEqual(resolution.explanations.map((item) => item.selected.kind), [
    'environment',
    'environment',
    'environment',
    'environment',
    'environment',
    'environment',
    'environment'
  ]);
});

test('resolveCliConfig reports invalid environment coercions as typed diagnostics', () => {
  const program = defineCli({
    name: 'ship',
    config: {
      fields: [
        { name: 'enabled', type: 'boolean', env: 'SHIP_ENABLED' },
        { name: 'retries', type: 'number', env: 'SHIP_RETRIES' },
        { name: 'spaced', type: 'number', env: 'SHIP_SPACED' },
        { name: 'metadata', type: 'object', env: 'SHIP_METADATA' },
        { name: 'metadataArray', type: 'object', env: 'SHIP_METADATA_ARRAY' }
      ]
    }
  });

  const resolution = resolveCliConfig(program, {
    env: {
      SHIP_ENABLED: 'yes',
      SHIP_RETRIES: '',
      SHIP_SPACED: '   ',
      SHIP_METADATA: 'not-json',
      SHIP_METADATA_ARRAY: '[]'
    }
  });

  assert.equal(resolution.ok, false);
  assert.deepEqual(resolution.values, {});
  assert.deepEqual(resolution.diagnostics.map((diagnostic) => diagnostic.code), [
    'CLI_CONFIG_VALUE_INVALID',
    'CLI_CONFIG_VALUE_INVALID',
    'CLI_CONFIG_VALUE_INVALID',
    'CLI_CONFIG_VALUE_INVALID',
    'CLI_CONFIG_VALUE_INVALID'
  ]);
  assert.deepEqual(resolution.diagnostics.map((diagnostic) => diagnostic.fields.field), [
    'enabled',
    'retries',
    'spaced',
    'metadata',
    'metadataArray'
  ]);
  assert.deepEqual(resolution.diagnostics.map((diagnostic) => diagnostic.fields.source), [
    'environment',
    'environment',
    'environment',
    'environment',
    'environment'
  ]);
});

test('resolveCliConfig does not warn for deprecated fields that are not selected', () => {
  const program = defineCli({
    name: 'ship',
    config: {
      fields: [
        { name: 'active', type: 'string' },
        { name: 'legacy', type: 'string', deprecated: true }
      ]
    }
  });

  const resolution = resolveCliConfig(program, {
    argv: { active: 'current' }
  });

  assert.equal(resolution.ok, true);
  assert.deepEqual(resolution.values, { active: 'current' });
  assert.deepEqual(resolution.diagnostics, []);
});

test('resolveCliConfig ignores environment entries for fields without env bindings', () => {
  const program = defineCli({
    name: 'ship',
    config: {
      fields: [{ name: 'mode', type: 'string' }]
    }
  });

  const resolution = resolveCliConfig(program, {
    env: { undefined: 'ambient' }
  });

  assert.equal(resolution.ok, true);
  assert.deepEqual(resolution.values, {});
  assert.deepEqual(resolution.diagnostics, []);
});

test('resolveCliConfig reports selected boolean deprecations with an empty reason', () => {
  const program = defineCli({
    name: 'ship',
    config: {
      fields: [{ name: 'legacy', type: 'string', deprecated: true }]
    }
  });

  const resolution = resolveCliConfig(program, {
    argv: { legacy: 'old' }
  });

  assert.equal(resolution.ok, true);
  assert.equal(resolution.diagnostics[0].code, 'CLI_CONFIG_FIELD_DEPRECATED');
  assert.deepEqual(resolution.diagnostics[0].fields, { field: 'legacy', reason: '' });
});

test('resolveCliConfig applies migration rename remove defaults in order', () => {
  const program = defineCli({
    name: 'ship',
    config: {
      version: '3',
      fields: [
        { name: 'region', type: 'string' },
        { name: 'retries', type: 'number' },
        { name: 'mode', type: 'string' }
      ],
      migrations: [
        { from: '1', to: '2', rename: { zone: 'region' }, defaults: { retries: 2 } },
        { from: '2', to: '3', remove: ['obsolete'], defaults: { mode: 'safe' } }
      ]
    }
  });

  const resolution = resolveCliConfig(program, {
    configFiles: [{ path: 'ship.v1.json', version: '1', values: { zone: 'eu', obsolete: 'drop' } }]
  });

  assert.equal(resolution.ok, true);
  assert.equal(resolution.version, '3');
  assert.deepEqual(resolution.values, { region: 'eu', retries: 2, mode: 'safe' });
  assert.deepEqual(resolution.entries.map((item) => item.source.path), ['ship.v1.json', 'ship.v1.json', 'ship.v1.json']);
});

test('resolveCliConfig keeps migrated values ahead of migration defaults', () => {
  const program = defineCli({
    name: 'ship',
    config: {
      fields: [
        { name: 'mode', type: 'string' },
        { name: 'region', type: 'string' }
      ],
      migrations: [{ from: '1', to: '2', rename: { zone: 'region' }, defaults: { mode: 'safe', region: 'us' } }]
    }
  });

  const resolution = resolveCliConfig(program, {
    configFiles: [{ path: 'ship.v1.json', version: '1', values: { zone: 'eu', mode: 'fast' } }]
  });

  assert.equal(resolution.ok, true);
  assert.deepEqual(resolution.values, { region: 'eu', mode: 'fast' });
});

test('resolveCliConfig ignores migration renames when the source key is absent', () => {
  const program = defineCli({
    name: 'ship',
    config: {
      fields: [{ name: 'region', type: 'string' }],
      migrations: [{ from: '1', to: '2', rename: { zone: 'region' } }]
    }
  });

  const resolution = resolveCliConfig(program, {
    configFiles: [{ path: 'ship.v1.json', version: '1', values: {} }]
  });

  assert.equal(resolution.ok, true);
  assert.deepEqual(resolution.values, {});
  assert.deepEqual(resolution.diagnostics, []);
});

test('resolveCliConfig reports unmatched migrated keys and unchanged migration versions', () => {
  const unmatchedProgram = defineCli({
    name: 'ship',
    config: {
      fields: [{ name: 'region', type: 'string' }],
      migrations: [{ from: '2', to: '3', rename: { zone: 'region' } }]
    }
  });
  const unchangedProgram = defineCli({
    name: 'ship',
    config: {
      fields: [{ name: 'mode', type: 'string' }],
      migrations: [
        { from: '0', to: '1', defaults: { mode: 'legacy' } },
        { from: '1', to: '1', defaults: { mode: 'safe' } }
      ]
    }
  });

  const unmatched = resolveCliConfig(unmatchedProgram, {
    configFiles: [{ path: 'ship.v1.json', version: '1', values: { zone: 'eu' } }]
  });
  const unchanged = resolveCliConfig(unchangedProgram, {
    configFiles: [{ path: 'ship.v1.json', version: '1', values: {} }]
  });

  assert.equal(unmatched.ok, false);
  assert.deepEqual(unmatched.values, {});
  assert.equal(unmatched.diagnostics[0].code, 'CLI_CONFIG_KEY_UNKNOWN');
  assert.deepEqual(unmatched.diagnostics[0].fields, { key: 'zone', source: 'config_file', path: 'ship.v1.json' });
  assert.equal(unchanged.ok, true);
  assert.equal(unchanged.values.mode, 'safe');
  assert.equal(unchanged.diagnostics[0].code, 'CLI_CONFIG_MIGRATION_UNCHANGED');
  assert.equal(unchanged.diagnostics[0].severity, 'warning');
  assert.deepEqual(unchanged.diagnostics[0].fields, { path: 'ship.v1.json', version: '1' });
});

test('resolveCliConfig works without a config definition', () => {
  const resolution = resolveCliConfig(defineCli({ name: 'empty' }));

  assert.equal(resolution.ok, true);
  assert.equal(resolution.version, undefined);
  assert.deepEqual(resolution.values, {});
  assert.deepEqual(resolution.entries, []);
  assert.deepEqual(resolution.explanations, []);
  assert.deepEqual(resolution.discovery, { scope: 'none', cwd: undefined, searchedPaths: [] });
});

test('resolveCliConfig reports file input against a program without config fields', () => {
  const resolution = resolveCliConfig(defineCli({ name: 'empty' }), {
    configFiles: [{ path: 'ship.json', values: { mode: 'file' } }],
    env: { undefined: 'ignored' }
  });

  assert.equal(resolution.ok, false);
  assert.deepEqual(resolution.values, {});
  assert.equal(resolution.diagnostics[0].code, 'CLI_CONFIG_KEY_UNKNOWN');
  assert.deepEqual(resolution.diagnostics[0].fields, { key: 'mode', source: 'config_file', path: 'ship.json' });
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
