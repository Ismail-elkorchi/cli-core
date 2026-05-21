import { defineCli, parseCli, resolveCliConfig } from '@ismail-elkorchi/cli-core';

export function runConfigResolutionExample() {
  const program = defineCli({
    name: 'ship',
    config: {
      fields: [
        { name: 'profile', type: 'string', default: 'default', env: 'SHIP_PROFILE' },
        { name: 'dryRun', type: 'boolean', default: false }
      ]
    },
    commands: [
      {
        name: 'deploy',
        options: [{ name: 'profile', type: 'string', flags: ['--profile'] }]
      }
    ]
  });
  const invocation = parseCli(program, { argv: ['deploy', '--profile', 'prod'] });

  return resolveCliConfig(program, {
    workspaceDefaults: { profile: 'workspace' },
    env: { SHIP_PROFILE: 'env' },
    argv: invocation.options.values
  });
}
