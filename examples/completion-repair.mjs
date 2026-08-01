import {
  completeCli,
  createCompletionPayload,
  defineCli
} from '@ismail-elkorchi/cli-core';
import {
  createCompletionCommand,
  createCompletionInstallPlan,
  createCompletionRequest,
  createCompletionScript
} from '@ismail-elkorchi/cli-core/completion';
import { createRepairSuggestionResult } from '@ismail-elkorchi/cli-core/repair';
import { createExampleInvocationParser } from './invocation.mjs';

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
  const invocation = createExampleInvocationParser().parse(program, { argv: ['deply', 'api'] });

  return {
    completion: createCompletionPayload(program, { word: 'd' }),
    bridge: completeCli(program, createCompletionRequest({ words: ['ship', '__complete', 'deploy', '--r'] })),
    command: createCompletionCommand(program),
    script: createCompletionScript(program, 'bash'),
    installPlan: createCompletionInstallPlan(program, 'fish'),
    repairs: createRepairSuggestionResult(invocation, program).suggestions
  };
}
