import {
  createCompletionInstallPlan,
  createCompletionPayload,
  createCompletionScript,
  defineCli,
  parseCli,
  suggestRepairs
} from '@ismail-elkorchi/cli-core';

export function runCompletionRepairExample() {
  const program = defineCli({
    name: 'ship',
    options: [{ name: 'verbose', type: 'boolean', flags: ['--verbose', '-v'] }],
    commands: [
      {
        name: 'deploy',
        aliases: ['d'],
        options: [{ name: 'region', type: 'string', flags: ['--region'] }],
        positionals: [{ name: 'service' }]
      }
    ]
  });
  const invocation = parseCli(program, { argv: ['deply', 'api'] });

  return {
    completion: createCompletionPayload(program, { word: 'd' }),
    script: createCompletionScript(program, 'bash'),
    installPlan: createCompletionInstallPlan(program, 'fish'),
    repairs: suggestRepairs(invocation, program)
  };
}
