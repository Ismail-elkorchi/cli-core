import assert from 'node:assert/strict';
import test from 'node:test';
import { frontierPressureCases } from './frontier-pressure-cases.mjs';

const requiredCompetitors = ['Commander', 'Yargs', 'oclif', 'Clipanion', 'CAC', 'Cliffy'];
const requiredGaps = [
  'GAP-1',
  'GAP-2',
  'GAP-3',
  'GAP-4',
  'GAP-5',
  'GAP-6',
  'GAP-7',
  'GAP-8',
  'GAP-9',
  'GAP-10',
  'GAP-11'
];

test('frontier pressure cases cover every required competitor and implementation gap', () => {
  const competitors = new Set(frontierPressureCases.map((item) => item.competitor));
  const gaps = new Set(frontierPressureCases.flatMap((item) => item.gapIds));

  for (const competitor of requiredCompetitors) {
    assert.equal(competitors.has(competitor), true, `${competitor} pressure case is missing`);
  }
  for (const gap of requiredGaps) {
    assert.equal(gaps.has(gap), true, `${gap} pressure coverage is missing`);
  }
});

test('frontier pressure cases keep source and product decisions explicit', () => {
  for (const item of frontierPressureCases) {
    assert.match(item.id, /^[a-z0-9-]+$/);
    assert.match(item.sourceUrl, /^https:\/\//);
    assert.ok(item.pressure.length > 40);
    assert.ok(item.cliCoreDecision.length > 40);
    assert.ok(item.affectedSurface.length > 0);
    assert.ok(item.gapIds.length > 0);
  }
});
