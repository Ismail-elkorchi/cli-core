import {
  createMemoryConfigDiscoveryHost,
  defineCli,
  discoverCliConfigInput,
  parseCli,
  resolveCliConfig
} from '@ismail-elkorchi/cli-core';

export async function runConfigResolutionExample() {
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
  const memory = createMemoryConfigDiscoveryHost({
    files: { '/workspace/.shiprc.json': { profile: 'file', dryRun: true } },
    env: { SHIP_PROFILE: 'env' }
  });
  const discovered = await discoverCliConfigInput(program, {
    host: memory.host,
    scope: 'cwd_only',
    cwd: '/workspace',
    filenames: ['.shiprc.json'],
    environment: { includeConfigFields: true }
  });

  const explicit = resolveCliConfig(program, {
    workspaceDefaults: { profile: 'workspace' },
    env: { SHIP_PROFILE: 'env' },
    argv: invocation.options.values
  });
  const hostDriven = resolveCliConfig(program, {
    ...discovered.input,
    argv: invocation.options.values
  });
  return { explicit, discovered, hostDriven };
}
