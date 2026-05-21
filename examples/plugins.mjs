import {
  checkCliPluginCompatibility,
  createCliPluginHost,
  defineCliPluginManifest
} from '@ismail-elkorchi/cli-core';

export async function runPluginsExample() {
  const manifest = defineCliPluginManifest({
    name: 'ship-audit',
    version: '1.0.0',
    capabilities: ['audit'],
    hooks: [{ name: 'audit-prerun', event: 'prerun' }]
  });
  const host = createCliPluginHost([
    {
      manifest,
      load: () => ({
        manifest,
        hooks: {
          'audit-prerun': (context) => ({
            effects: [{ kind: 'audit.record', data: { event: context.event } }]
          })
        }
      })
    }
  ], { allowedCapabilities: ['audit'] });

  return {
    compatibility: checkCliPluginCompatibility(manifest, { allowedCapabilities: ['audit'] }),
    plan: host.planHooks('prerun'),
    run: await host.runHooks('prerun')
  };
}
