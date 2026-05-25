import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCliEffects,
  createMemoryEffectHost,
  planCliEffects
} from '../../dist/effects/index.js';
import { createCliDiagnostic } from '../../dist/diagnostics.js';

test('planCliEffects reports effects without applying a host', () => {
  const memory = createMemoryEffectHost();
  const report = planCliEffects([{ kind: 'write_file', path: 'ship.txt', content: 'secret=token' }]);

  assert.equal(report.schemaVersion, 'cli-core.effect-application.v1');
  assert.equal(report.mode, 'plan');
  assert.equal(report.ok, true);
  assert.equal(report.reports[0].status, 'planned');
  assert.equal(report.reports[0].payload, null);
  assert.deepEqual(report.reports[0].diagnostics, []);
  assert.deepEqual(memory.files(), {});
  assert.equal(report.reports[0].effect.content, '[REDACTED]');
});

test('applyCliEffects honors plan mode even when a host could apply effects', async () => {
  const memory = createMemoryEffectHost();
  const report = await applyCliEffects({
    mode: 'plan',
    effects: [{ kind: 'write_file', path: 'ship.txt', content: 'ok' }],
    host: memory.host,
    policy: { allowWriteFile: true }
  });

  assert.equal(report.mode, 'plan');
  assert.equal(report.ok, true);
  assert.deepEqual(report.reports.map((item) => item.status), ['planned']);
  assert.deepEqual(memory.files(), {});
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
  assert.equal(missingHost.diagnostics[0].severity, 'error');
  assert.equal(missingHost.diagnostics[0].fields.effectKind, 'spawn');
  assert.equal(missingHost.reports[0].status, 'denied');
  assert.equal(missingPolicy.ok, false);
  assert.equal(missingPolicy.diagnostics[0].code, 'CLI_EFFECT_DENIED');
  assert.equal(missingPolicy.diagnostics[0].fields.effectKind, 'spawn');
  assert.equal(missingPolicy.reports[0].diagnostics[0].code, 'CLI_EFFECT_DENIED');
});

test('applyCliEffects reports policy and host denials for each effect kind', async () => {
  const memory = createMemoryEffectHost();
  const denied = await applyCliEffects({
    effects: [
      { kind: 'spawn', command: 'ship', argv: ['deploy'] },
      { kind: 'write_file', path: 'ship.txt', content: 'ok' },
      { kind: 'delete_path', path: 'old.txt' },
      { kind: 'custom', name: 'notify', payload: { channel: 'ops' } }
    ],
    host: {
      writeFile: memory.host.writeFile
    },
    policy: {
      allowSpawn: false,
      allowWriteFile: true,
      allowDeletePath: true,
      allowCustom: true
    }
  });

  assert.equal(denied.ok, false);
  assert.deepEqual(denied.reports.map((item) => item.status), ['denied', 'applied', 'denied', 'denied']);
  assert.deepEqual(denied.diagnostics.map((diagnostic) => diagnostic.fields.effectKind), [
    'spawn',
    'delete_path',
    'custom'
  ]);
  assert.equal(denied.diagnostics[1].fields.path, 'old.txt');
});

test('applyCliEffects denies effects when policy disallows a host-supported operation', async () => {
  const memory = createMemoryEffectHost();
  const denied = await applyCliEffects({
    effects: [
      { kind: 'spawn', command: 'ship', argv: ['deploy'] },
      { kind: 'write_file', path: 'ship.txt', content: 'ok' },
      { kind: 'delete_path', path: 'old.txt' },
      { kind: 'custom', name: 'notify', payload: { channel: 'ops' } }
    ],
    host: memory.host,
    policy: {
      allowSpawn: false,
      allowWriteFile: false,
      allowDeletePath: false,
      allowCustom: false
    }
  });

  assert.equal(denied.ok, false);
  assert.deepEqual(denied.reports.map((item) => item.status), ['denied', 'denied', 'denied', 'denied']);
  assert.deepEqual(denied.diagnostics.map((diagnostic) => diagnostic.code), [
    'CLI_EFFECT_DENIED',
    'CLI_EFFECT_DENIED',
    'CLI_EFFECT_DENIED',
    'CLI_EFFECT_DENIED'
  ]);
  assert.deepEqual(memory.files(), {});
  assert.deepEqual(memory.spawns(), []);
});

test('applyCliEffects denies host-unsupported operations even when policy allows them', async () => {
  const denied = await applyCliEffects({
    effects: [
      { kind: 'spawn', command: 'ship', argv: ['deploy'] },
      { kind: 'write_file', path: 'ship.txt', content: 'ok' }
    ],
    host: {},
    policy: {
      allowSpawn: true,
      allowWriteFile: true
    }
  });

  assert.equal(denied.ok, false);
  assert.deepEqual(denied.reports.map((item) => item.status), ['denied', 'denied']);
  assert.equal(denied.diagnostics[0].fields.effectKind, 'spawn');
  assert.equal(denied.diagnostics[1].fields.effectKind, 'write_file');
  assert.equal(denied.diagnostics[1].fields.path, 'ship.txt');
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
  assert.deepEqual(report.reports.map((item) => item.payload), [
    { path: 'ship.txt', bytes: 2 },
    { path: 'old.txt', deleted: true }
  ]);
  assert.equal(memory.files()['ship.txt'], 'ok');
  assert.equal(memory.files()['old.txt'], undefined);
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
  assert.equal(memory.spawns()[0].env.SHIP_TOKEN, 'token-secret');
  assert.equal(report.reports[0].payload.command, 'ship');
  assert.equal(report.reports[0].payload.exitStatus, 0);
  assert.equal(report.reports[0].effect.env.SHIP_TOKEN, '[REDACTED]');
});

test('memory effect host returns structured spawn payloads when redaction is disabled', async () => {
  const memory = createMemoryEffectHost();
  const report = await applyCliEffects({
    effects: [{ kind: 'spawn', command: 'ship', argv: ['deploy', 'api'] }],
    host: memory.host,
    policy: { allowSpawn: true },
    redaction: { enabled: false }
  });

  assert.deepEqual(report.reports[0].payload, { command: 'ship', argv: ['deploy', 'api'], exitStatus: 0 });
  assert.equal(report.reports[0].effect.env, undefined);
  assert.equal(memory.spawns()[0].env, undefined);
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

test('host failures produce typed failed reports with error details', async () => {
  const thrown = await applyCliEffects({
    effects: [{ kind: 'write_file', path: 'ship.txt', content: 'ok' }],
    host: {
      writeFile() {
        throw new Error('disk unavailable');
      }
    },
    policy: { allowWriteFile: true }
  });
  const unknownThrown = await applyCliEffects({
    effects: [{ kind: 'delete_path', path: 'old.txt' }],
    host: {
      deletePath() {
        throw { problem: 'opaque' };
      }
    },
    policy: { allowDeletePath: true }
  });

  assert.equal(thrown.ok, false);
  assert.equal(thrown.reports[0].status, 'failed');
  assert.equal(thrown.reports[0].payload, null);
  assert.equal(thrown.diagnostics[0].code, 'CLI_EFFECT_APPLY_FAILED');
  assert.equal(thrown.diagnostics[0].fields.effectKind, 'write_file');
  assert.equal(thrown.diagnostics[0].fields.errorMessage, 'disk unavailable');
  assert.equal(thrown.reports[0].diagnostics[0].code, 'CLI_EFFECT_APPLY_FAILED');
  assert.equal(unknownThrown.diagnostics[0].fields.errorMessage, 'Unknown effect host error.');
});

test('host failures preserve string thrown values as diagnostic fields', async () => {
  const report = await applyCliEffects({
    effects: [{ kind: 'custom', name: 'notify' }],
    host: {
      applyCustom() {
        throw 'custom failure';
      }
    },
    policy: { allowCustom: true }
  });

  assert.equal(report.ok, false);
  assert.equal(report.diagnostics[0].fields.effectKind, 'custom');
  assert.equal(report.diagnostics[0].fields.errorMessage, 'custom failure');
});

test('host result diagnostics and ok false control item and report status', async () => {
  const hostDiagnostic = createCliDiagnostic('CLI_RUN_INVALID_EFFECT', 'error', 'Invalid write.', {
    effectKind: 'write_file',
    path: 'ship.txt'
  });
  const hostWarning = createCliDiagnostic('CLI_RUN_INVALID_EFFECT', 'warning', 'Spawn returned nonzero.', {
    effectKind: 'spawn'
  });
  const report = await applyCliEffects({
    effects: [
      { kind: 'write_file', path: 'ship.txt', content: 'ok' },
      { kind: 'spawn', command: 'ship', argv: ['deploy'] }
    ],
    host: {
      writeFile: () => ({ payload: { path: 'ship.txt' }, diagnostics: [hostDiagnostic] }),
      applySpawn: () => ({ ok: false, payload: { exitStatus: 1 }, diagnostics: [hostWarning] })
    },
    policy: { allowWriteFile: true, allowSpawn: true }
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.reports.map((item) => item.status), ['failed', 'failed']);
  assert.deepEqual(report.reports.map((item) => item.payload), [{ path: 'ship.txt' }, { exitStatus: 1 }]);
  assert.deepEqual(report.diagnostics.map((diagnostic) => diagnostic.severity), ['error', 'warning']);
});

test('report ok is false for a failed item even when diagnostics are warnings only', async () => {
  const warning = createCliDiagnostic('CLI_RUN_INVALID_EFFECT', 'warning', 'Spawn returned nonzero.', {
    effectKind: 'spawn'
  });
  const report = await applyCliEffects({
    effects: [
      { kind: 'write_file', path: 'ship.txt', content: 'ok' },
      { kind: 'spawn', command: 'ship', argv: ['deploy'] }
    ],
    host: {
      writeFile: () => ({ payload: { path: 'ship.txt' } }),
      applySpawn: () => ({ ok: false, payload: { exitStatus: 1 }, diagnostics: [warning] })
    },
    policy: { allowWriteFile: true, allowSpawn: true }
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.reports.map((item) => item.status), ['applied', 'failed']);
  assert.deepEqual(report.diagnostics.map((diagnostic) => diagnostic.severity), ['warning']);
});

test('memory effect host supports custom effects and empty file content', async () => {
  const memory = createMemoryEffectHost();
  const report = await applyCliEffects({
    effects: [
      { kind: 'write_file', path: 'empty.txt' },
      { kind: 'custom', name: 'notify', payload: { channel: 'ops' } }
    ],
    host: memory.host,
    policy: { allowWriteFile: true, allowCustom: true }
  });

  assert.equal(report.ok, true);
  assert.equal(memory.files()['empty.txt'], '');
  assert.deepEqual(report.reports.map((item) => item.payload), [
    { path: 'empty.txt', bytes: 0 },
    { effectKind: 'custom' }
  ]);
});
