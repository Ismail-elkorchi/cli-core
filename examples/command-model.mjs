import { defineCli, validateCli } from '@ismail-elkorchi/cli-core';
import { createExampleInvocationParser } from './invocation.mjs';

export async function runCommandModelExample() {
  const program = defineCli({
    name: 'ship',
    options: [{ name: 'verbose', type: 'boolean', flags: ['--verbose', '-v'] }],
    commands: [
      {
        name: 'deploy',
        aliases: ['d'],
        options: [{ name: 'region', type: 'string', flags: ['--region'], required: true }],
        positionals: [{ name: 'service' }]
      }
    ]
  });

  const parser = createExampleInvocationParser({
    values: { verbose: true, region: 'eu' },
    present: ['verbose', 'region'],
    positionals: ['api']
  });
  const invocation = parser.parse(program, {
    argv: ['d', '--verbose', '--region', 'eu', 'api']
  });
  const validation = await validateCli(program, invocation);

  return {
    program,
    invocation,
    validation
  };
}
