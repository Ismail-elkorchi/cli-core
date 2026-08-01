import {
  createCliInvocation,
  createCliInvocationParser,
  defineCli,
  dispatchCli,
  type CliHandlers,
  type CliOptionBinder,
  type ParsedInvocationSuccess
} from '../../src/index.ts';

const program = defineCli({
  name: 'ship',
  options: [{ name: 'verbose', kind: 'boolean', flags: ['-v'] }],
  commands: [{
    name: 'deploy',
    options: [{ name: 'region', kind: 'value', flags: ['--region'], valueMode: 'required' }]
  }]
});
const keys: readonly ('ship' | 'ship deploy')[] = program.commandKeys;
const paths: readonly (readonly [] | readonly ['deploy'])[] = program.commandPaths;
void keys;
void paths;

// @ts-expect-error boolean options cannot have value labels
defineCli({ name: 'ship', options: [{ name: 'verbose', kind: 'boolean', flags: ['-v'], valueLabel: 'level' }] });

// @ts-expect-error value options require an explicit value mode
defineCli({ name: 'ship', options: [{ name: 'region', kind: 'value', flags: ['--region'] }] });

// @ts-expect-error definition objects are closed for object literals
defineCli({ name: 'ship', unsupported: true });

const binder: CliOptionBinder = {
  scan: () => ({
    status: 'scanned',
    options: [],
    arguments: [],
    afterDoubleDash: [],
    unknownFlags: []
  }),
  bind: ({ options }) => ({
    status: 'bound',
    values: {},
    specified: Object.fromEntries(options.map((option) => [option.name, false])),
    positionals: [],
    afterDoubleDash: [],
    unknownFlags: []
  })
};
const parser = createCliInvocationParser(binder);
const invocation = parser.parse(program);
if (invocation.status === 'parsed') {
  const commandKey: 'ship' | 'ship deploy' = invocation.commandKey;
  void commandKey;
  invocation.optionValues;
  void dispatchCli(invocation, { ship: () => 1 }, undefined);
} else {
  invocation.diagnostics;
  // @ts-expect-error rejected invocations never expose partial option values
  invocation.optionValues;
  // @ts-expect-error dispatch requires a successful invocation
  void dispatchCli(invocation, {}, undefined);
}

type DeployInvocation = Omit<ParsedInvocationSuccess, 'commandKey' | 'command'> & {
  readonly commandKey: 'ship deploy';
  readonly command: ParsedInvocationSuccess['command'] & { readonly key: 'ship deploy' };
};
type RootInvocation = Omit<ParsedInvocationSuccess, 'commandKey' | 'command'> & {
  readonly commandKey: 'ship';
  readonly command: ParsedInvocationSuccess['command'] & { readonly key: 'ship' };
};
type Handlers = CliHandlers<DeployInvocation | RootInvocation, undefined, number>;
const handlers: Handlers = {
  ship: ({ invocation: root }) => root.command.key === 'ship' ? 1 : 0,
  'ship deploy': ({ invocation: deploy }) => deploy.command.key === 'ship deploy' ? 2 : 0,
  // @ts-expect-error handler keys are restricted to compiled command keys
  typo: () => 3
};
void handlers;

createCliInvocation(program, {
  commandPath: ['deploy'],
  optionValues: { region: 'eu' },
  specifiedOptions: { verbose: false, region: true },
  positionalValues: {}
});
