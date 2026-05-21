import {
  applyCliPluginCommands,
  checkCliPluginCompatibility,
  createCliPluginHost,
  defineCliPluginManifest
} from '@ismail-elkorchi/cli-core';

export async function runPluginsExample() {
  const manifest = defineCliPluginManifest({
    name: 'ship-audit',
    version: '1.0.0',
    capabilities: ['audit'],
    commands: [{ name: 'audit', aliases: ['a'], description: 'Inspect deployment history.' }],
    hooks: [{ name: 'audit-prerun', event: 'prerun' }]
  });
  const application = applyCliPluginCommands({
    name: 'ship',
    commands: [{ name: 'status' }]
  }, [manifest], { allowedCapabilities: ['audit'] });
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
    application,
    plan: host.planHooks('prerun'),
    run: await host.runHooks('prerun')
  };
}
