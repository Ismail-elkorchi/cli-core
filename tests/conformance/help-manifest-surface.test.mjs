import assert from 'node:assert/strict';
import test from 'node:test';

test('help and manifest subpaths expose document APIs', async () => {
  const help = await import('../../dist/help/index.js');
  const manifest = await import('../../dist/manifest/index.js');
  const root = await import('../../dist/index.js');

  assert.equal(typeof help.createHelpDocument, 'function');
  assert.equal(typeof help.createVersionDocument, 'function');
  assert.equal(typeof manifest.describeCli, 'function');
  assert.equal(typeof manifest.exportCommandManifest, 'function');
  assert.equal(typeof manifest.importCommandManifest, 'function');
  assert.equal(typeof root.createHelpDocument, 'function');
  assert.equal(typeof root.describeCli, 'function');
});
