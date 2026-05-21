import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('root and effects subpath expose effect application APIs', async () => {
  const root = await import('../../dist/index.js');
  const effects = await import('../../dist/effects/index.js');

  assert.equal(typeof root.planCliEffects, 'function');
  assert.equal(typeof root.applyCliEffects, 'function');
  assert.equal(typeof root.createMemoryEffectHost, 'function');
  assert.equal(typeof effects.planCliEffects, 'function');
  assert.equal(typeof effects.applyCliEffects, 'function');
  assert.equal(typeof effects.createMemoryEffectHost, 'function');
});

test('effect declarations include host, policy, and report contracts', async () => {
  const text = await readFile(new URL('../../dist/effects/index.d.ts', import.meta.url), 'utf8');

  assert.match(text, /CliEffectHost/);
  assert.match(text, /EffectApplicationPolicy/);
  assert.match(text, /EffectApplicationReport/);
  assert.match(text, /MemoryEffectHost/);
  assert.match(text, /readonly payload/);
  assert.doesNotMatch(text, /readonly data/);
  assert.doesNotMatch(text, /internal\//);
});
