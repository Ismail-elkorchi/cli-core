import { defineCli, parseCli, runCli } from '@ismail-elkorchi/cli-core';

export async function runExecutionExample() {
  const program = defineCli({
    name: 'ship',
    commands: [{ name: 'deploy', positionals: [{ name: 'service' }] }]
  });
  const invocation = parseCli(program, { argv: ['deploy', 'api'] });
  const plan = await runCli(program, {
    mode: 'plan',
    invocation,
    effects: [{ kind: 'spawn', command: 'ship', argv: ['deploy', 'api'] }]
  });
  const apply = await runCli(program, {
    mode: 'apply',
    invocation,
    handlers: {
      deploy: () => ({
        artifacts: [{ id: 'deploy-summary', kind: 'json', data: { service: 'api' } }]
      })
    }
  });

  return { plan, apply };
}
