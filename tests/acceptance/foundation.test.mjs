import assert from 'node:assert/strict';
import test from 'node:test';
import { cliCorePackage } from '../../dist/index.js';

test('consumer can import the package root', () => {
  assert.equal(cliCorePackage.name, '@ismail-elkorchi/cli-core');
});
