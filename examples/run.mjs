import { defineCli, runCli } from '@ismail-elkorchi/cli-core';
import { createCliPluginHost } from '@ismail-elkorchi/cli-core/plugins';
import { createExampleInvocationParser } from './invocation.mjs';

export async function runExecutionExample() {
  const program = defineCli({
    name: 'ship',
    commands: [{ name: 'deploy', positionals: [{ name: 'service' }] }]
  });
  const invocation = createExampleInvocationParser({ positionals: ['api'] })
    .parse(program, { argv: ['deploy', 'api'] });
  const pluginHost = createCliPluginHost([
    {
      manifest: { name: 'audit', version: '1.0.0', hooks: [{ name: 'record', event: 'prerun' }] },
      load: () => ({
        hooks: {
          record: () => ({ effects: [{ kind: 'audit.record', payload: { command: 'deploy' } }] })
        }
      })
    }
  ]);
  const plan = await runCli(program, {
    mode: 'plan',
    invocation,
    pluginHost,
    effects: [{ kind: 'spawn', command: 'ship', argv: ['deploy', 'api'] }]
  });
  const apply = await runCli(program, {
    mode: 'apply',
    invocation,
    handlers: {
      deploy: () => ({
        artifacts: [{ id: 'deploy-summary', kind: 'json', payload: { service: 'api' } }]
      })
    }
  });

  return { plan, apply };
}
