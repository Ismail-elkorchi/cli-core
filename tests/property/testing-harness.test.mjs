import assert from 'node:assert/strict';
import test from 'node:test';
import { createCliFixtureRegistry } from '../../dist/testing/index.js';

test('registry snapshots are independent immutable views', () => {
  const registry = createCliFixtureRegistry([
    {
      id: 'commands.tree-program',
      family: 'commands',
      title: 'Tree program',
      capabilities: ['command.tree']
    }
  ]);

  const first = registry.snapshot();
  const second = registry.snapshot();

  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  assert.throws(() => {
    first.push({
      id: 'commands.injected',
      family: 'commands',
      title: 'Injected',
      capabilities: []
    });
  }, TypeError);
  assert.equal(registry.has('commands.injected'), false);
});
