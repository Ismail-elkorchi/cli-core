import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCliEffects,
  createMemoryEffectHost,
  planCliEffects
} from '../../dist/index.js';

test('planCliEffects reports effects without applying a host', () => {
  const memory = createMemoryEffectHost();
  const report = planCliEffects([{ kind: 'write_file', path: 'ship.txt', content: 'secret=token' }]);

  assert.equal(report.schemaVersion, 'cli-core.effect-application.v1');
  assert.equal(report.mode, 'plan');
  assert.equal(report.ok, true);
  assert.equal(report.reports[0].status, 'planned');
  assert.deepEqual(memory.files(), {});
  assert.equal(report.reports[0].effect.content, '[REDACTED]');
});

test('applyCliEffects denies effects without an explicit host and policy', async () => {
  const missingHost = await applyCliEffects({
    effects: [{ kind: 'spawn', command: 'ship', argv: ['deploy'] }]
  });
  const missingPolicy = await applyCliEffects({
    effects: [{ kind: 'spawn', command: 'ship', argv: ['deploy'] }],
    host: createMemoryEffectHost().host
  });

  assert.equal(missingHost.ok, false);
  assert.equal(missingHost.diagnostics[0].code, 'CLI_EFFECT_HOST_MISSING');
  assert.equal(missingPolicy.ok, false);
  assert.equal(missingPolicy.diagnostics[0].code, 'CLI_EFFECT_DENIED');
});

test('memory effect host applies file effects without touching disk', async () => {
  const memory = createMemoryEffectHost();
  const report = await applyCliEffects({
    effects: [
      { kind: 'write_file', path: 'ship.txt', content: 'ok' },
      { kind: 'delete_path', path: 'old.txt' }
    ],
    host: memory.host,
    policy: { allowWriteFile: true, allowDeletePath: true }
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.reports.map((item) => item.status), ['applied', 'applied']);
  assert.equal(memory.files()['ship.txt'], 'ok');
});

test('memory effect host records spawn effects without launching a process', async () => {
  const memory = createMemoryEffectHost();
  const report = await applyCliEffects({
    effects: [{ kind: 'spawn', command: 'ship', argv: ['deploy', 'api'], env: { SHIP_TOKEN: 'token-secret' } }],
    host: memory.host,
    policy: { allowSpawn: true }
  });

  assert.equal(report.ok, true);
  assert.equal(memory.spawns()[0].command, 'ship');
  assert.deepEqual(memory.spawns()[0].argv, ['deploy', 'api']);
  assert.equal(report.reports[0].effect.env.SHIP_TOKEN, '[REDACTED]');
});

test('denied effects produce typed redacted reports', async () => {
  const memory = createMemoryEffectHost();
  const report = await applyCliEffects({
    effects: [{ kind: 'write_file', path: 'secret.txt', content: 'password=hidden' }],
    host: memory.host,
    policy: { allowSpawn: true }
  });

  assert.equal(report.ok, false);
  assert.equal(report.reports[0].status, 'denied');
  assert.equal(report.reports[0].diagnostics[0].code, 'CLI_EFFECT_DENIED');
  assert.equal(report.reports[0].effect.content, '[REDACTED]');
  assert.deepEqual(memory.files(), {});
});
