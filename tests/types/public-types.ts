import {
  createCliInvocation,
  createCliInvocationParser,
  defineCli,
  dispatchCli,
  type CliHandlers,
  type CliInvocation,
  type CliOptionBinder,
  type CliInvokableCommandKey,
  type CliScannedOption
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

// @ts-expect-error default labels require a materialized default
defineCli({ name: 'ship', options: [{ name: 'region', kind: 'value', flags: ['--region'], valueMode: 'required', defaultLabel: 'eu' }] });

// @ts-expect-error implicit labels require optional-inline value mode
defineCli({ name: 'ship', options: [{ name: 'region', kind: 'value', flags: ['--region'], valueMode: 'required', implicitValueLabel: 'automatic' }] });

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
if (invocation.status === 'ready') {
  const commandKey: 'ship' | 'ship deploy' = invocation.commandKey;
  void commandKey;
  invocation.optionValues;
  if (invocation.source.kind === 'argv') {
    const argv: readonly string[] = invocation.source.argv;
    void argv;
  } else {
    const sourceId: string | undefined = invocation.source.sourceId;
    void sourceId;
  }
  void dispatchCli(invocation, {
    ship: ({ invocation: root }) => {
      const key: 'ship' = root.commandKey;
      const commandKey: 'ship' = root.command.key;
      return key === commandKey ? 1 : 0;
    },
    'ship deploy': ({ invocation: deploy }) => {
      const key: 'ship deploy' = deploy.commandKey;
      const commandKey: 'ship deploy' = deploy.command.key;
      return key === commandKey ? 2 : 0;
    }
  }, undefined);
} else {
  invocation.diagnostics;
  // @ts-expect-error rejected invocations never expose partial option values
  invocation.optionValues;
  // @ts-expect-error dispatch requires a successful invocation
  void dispatchCli(invocation, {}, undefined);
}

type ProgramInvocation = Extract<typeof invocation, CliInvocation>;
type Handlers = CliHandlers<ProgramInvocation, undefined, number>;
const handlers: Handlers = {
  ship: ({ invocation: root }) => root.command.key === 'ship' ? 1 : 0,
  'ship deploy': ({ invocation: deploy }) => deploy.command.key === 'ship deploy' ? 2 : 0,
  // @ts-expect-error handler keys are restricted to compiled command keys
  typo: () => 3
};
void handlers;

// @ts-expect-error every invokable command requires a handler
const missingHandler: Handlers = { ship: () => 1 };
void missingHandler;

createCliInvocation(program, {
  commandPath: ['deploy'],
  optionValues: { region: 'eu' },
  specifiedOptions: { verbose: false, region: true },
  positionalValues: {}
});

const structuredWithExtra = {
  commandPath: ['deploy'],
  optionValues: { region: 'eu' },
  specifiedOptions: { verbose: false, region: true },
  positionalValues: {},
  unsupported: true
} as const;
// @ts-expect-error structured invocation inputs are closed through variables
createCliInvocation(program, structuredWithExtra);

const groupedDefinition = {
  name: 'tool',
  invokable: false,
  commands: [{ name: 'run' }]
} as const;
const groupedProgram = defineCli(groupedDefinition);
type GroupedKey = CliInvokableCommandKey<typeof groupedDefinition>;
const groupedKey: GroupedKey = 'tool run';
// @ts-expect-error non-invokable grouping commands are not invocation keys
const invalidGroupedKey: GroupedKey = 'tool';
void groupedKey;
void invalidGroupedKey;
void groupedProgram;

const positionalsWithUnknownProperty = [{ name: 'input', typo: true }] as const;
// @ts-expect-error positional definitions are closed through variables
defineCli({ name: 'tool', positionals: positionalsWithUnknownProperty });

const aliasesWithUnknownProperty = [{ name: 'r', typo: true }] as const;
// @ts-expect-error alias definitions are closed through variables
defineCli({ name: 'tool', commands: [{ name: 'run', aliases: aliasesWithUnknownProperty }] });

// @ts-expect-error explicit scanned values require their raw value and inline ownership
const incompleteScannedValue: CliScannedOption = {
  option: 'output',
  flag: '-o',
  argvElement: '-o',
  argvIndex: 0,
  valueArgvIndex: 1
};
void incompleteScannedValue;
