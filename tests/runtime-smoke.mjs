import {
  completeCli,
  createCliHelp,
  defineCli,
  findCliCommand
} from '../src/index.ts';

const program = defineCli({
  name: 'ship',
  commands: [{ name: 'deploy', aliases: ['d'] }]
});

if (findCliCommand(program, ['deploy'])?.key !== 'ship deploy') throw new Error('command lookup failed');
if (createCliHelp(program).commands[0]?.name !== 'deploy') throw new Error('help failed');
if (completeCli(program, { prefix: 'd' }).length !== 2) throw new Error('completion failed');
