import assert from 'node:assert/strict';
import test from 'node:test';
import { defineCli, resolveCliConfig } from '../../dist/index.js';

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
  assert.equal(resolution.diagnostics[0].code, 'CLI_ARGV_FLAG_ISSUE');
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
