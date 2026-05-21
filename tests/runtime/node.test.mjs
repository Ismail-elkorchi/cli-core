import assert from 'node:assert/strict';
import test from 'node:test';
import { cliCorePackage } from '../../dist/index.js';
import { describeCliSchemas } from '../../dist/schema/index.js';

test('node runtime can load package root', () => {
  assert.equal(cliCorePackage.name, '@ismail-elkorchi/cli-core');
  assert.equal(describeCliSchemas().some((schema) => schema.version === 'cli-core.schema-envelope.v1'), true);
});
