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

const parent = defineCli({ name: 'tool', commands: [{ name: 'run' }] });
const finalUnknownParser = createCliInvocationParser({ create: () => ({
  next: () => ({ nextIndex: 1, options: [], controlOptions: [], arguments: [], controls: [], afterDoubleDash: [],
    unknownFlags: [{ argvElement: '--extra', flag: '--extra', argvIndex: 0 }], diagnostics: [], unclassified: [] }),
  bind: () => ({ status: 'bound', values: {}, specified: {} })
}) });
if (finalUnknownParser.parse(parent, { argv: ['--extra'], unknownFlagPolicy: 'collect' }).status !== 'ready') {
  throw new Error('final unknown flag collection failed');
}
if (finalUnknownParser.parse(parent, { argv: ['--extra', 'run'], unknownFlagPolicy: 'collect' }).status !== 'invalid') {
  throw new Error('uncertain command routing was accepted');
}
const passthrough = Array.from({ length: 150000 }, (_, index) => `value-${index}`);
const largeParser = createCliInvocationParser({ create: () => ({
  next: () => ({ nextIndex: passthrough.length + 1, options: [], controlOptions: [], arguments: [], controls: [],
    afterDoubleDash: passthrough.map((value, index) => ({ value, argvIndex: index + 1 })), doubleDashArgvIndex: 0,
    unknownFlags: [], diagnostics: [], unclassified: [] }),
  bind: () => ({ status: 'bound', values: {}, specified: {} })
}) });
const large = largeParser.parse(defineCli({ name: 'tool', acceptsPassthroughArguments: true }), { argv: ['--', ...passthrough] });
if (large.status !== 'ready' || large.passthroughArguments.length !== passthrough.length ||
  large.passthroughArguments.some((value, index) => value !== passthrough[index])) {
  throw new Error('large passthrough ownership failed');
}
