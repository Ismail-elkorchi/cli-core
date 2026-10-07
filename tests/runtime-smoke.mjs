import {
  completeCli,
  createCliHelp,
  createCliInvocation,
  createCliInvocationParser,
  defineCli,
  dispatchCli,
  findCliCommand
} from '../src/index.ts';

const program = defineCli({
  name: 'ship',
  commands: [{ name: 'deploy', aliases: ['d'], positionals: [{ name: 'target' }] }]
});

if (findCliCommand(program, ['deploy'])?.key !== 'ship deploy') throw new Error('command lookup failed');
if (createCliHelp(program).commands[0]?.name !== 'deploy') throw new Error('help failed');
if (completeCli(program, { prefix: 'd' }).length !== 2) throw new Error('completion failed');
let decodes = 0;
const parser = createCliInvocationParser({
  create(argv) {
    let index = 0;
    return {
      next() {
        const argvIndex = index++;
        return {
          nextIndex: index,
          options: [], controlOptions: [], controls: [], afterDoubleDash: [],
          unknownFlags: [], diagnostics: [], unclassified: [],
          arguments: [{ value: argv[argvIndex], argvIndex }]
        };
      },
      bind() {
        decodes++;
        return { status: 'bound', values: {}, specified: {} };
      }
    };
  }
});
const route = parser.route(program, { argv: ['d', 'api'] });
if (route.status !== 'routed' || route.command.key !== 'ship deploy') throw new Error('routing failed');
const invocation = parser.bind(route);
if (invocation.status !== 'ready' || invocation.positionalValues.target !== 'api') throw new Error('positional binding failed');
parser.bind(route, { unknownFlagPolicy: 'collect' });
if (decodes !== 1) throw new Error('decoder was repeated');
const result = await dispatchCli(invocation, { ship: () => '', 'ship deploy': () => 'deployed' }, undefined);
if (result !== 'deployed') throw new Error('dispatch failed');
const structured = createCliInvocation(program, {
  commandPath: ['deploy'], optionValues: {}, specifiedOptions: {}, positionalValues: { target: 'api' }
});
if (structured.status !== 'ready' || structured.commandKey !== 'ship deploy') throw new Error('structured invocation failed');
