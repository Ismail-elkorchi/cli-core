import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkCliPluginCompatibility,
  createCliPluginHost,
  defineCliPluginManifest
} from '../../dist/index.js';

test('consumer can validate a plugin manifest and run declared hooks lazily', async () => {
  let loaded = false;
  const manifest = defineCliPluginManifest({
    name: 'ship-audit',
    version: '1.0.0',
    capabilities: ['audit'],
    hooks: [{ name: 'audit-prerun', event: 'prerun' }]
  });
  const compatibility = checkCliPluginCompatibility(manifest, {
    allowedCapabilities: ['audit'],
    runtime: 'node'
  });
  const host = createCliPluginHost([
    {
      manifest,
      load: () => {
        loaded = true;
        return {
          manifest,
          hooks: {
            'audit-prerun': (context) => ({ effects: [{ kind: 'audit.seen', data: { event: context.event } }] })
          }
        };
      }
    }
  ], { allowedCapabilities: ['audit'] });

  assert.equal(compatibility.ok, true);
  assert.equal(loaded, false);

  const result = await host.runHooks('prerun');

  assert.equal(result.ok, true);
  assert.equal(loaded, true);
  assert.equal(result.hooks[0].effects[0].kind, 'audit.seen');
});
