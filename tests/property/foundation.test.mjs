import assert from 'node:assert/strict';
import test from 'node:test';
import { cliCorePackage } from '../../dist/index.js';

test('package metadata remains JSON serializable', () => {
  for (let index = 0; index < 10; index += 1) {
    assert.deepEqual(JSON.parse(JSON.stringify(cliCorePackage)), cliCorePackage);
  }
});
