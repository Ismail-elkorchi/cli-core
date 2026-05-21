import assert from 'node:assert/strict';
import test from 'node:test';
import { cliCorePackage } from '../../dist/index.js';

test('node runtime can load package root', () => {
  assert.equal(cliCorePackage.name, '@ismail-elkorchi/cli-core');
});
