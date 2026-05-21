import assert from 'node:assert/strict';
import test from 'node:test';
import { cliCorePackage } from '../../dist/index.js';

test('root entrypoint exposes package contract metadata', () => {
  assert.equal(cliCorePackage.name, '@ismail-elkorchi/cli-core');
  assert.equal(cliCorePackage.contractVersion, '0.1.0');
  assert.throws(() => {
    cliCorePackage.name = 'changed';
  }, TypeError);
});
