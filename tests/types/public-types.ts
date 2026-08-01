import {
  createCliInvocationParser,
  defineCli,
  dispatchCli,
  type CliOptionBinder,
  type ParsedInvocation
} from '../../src/index.ts';

defineCli({
  name: 'ship',
  options: [
    { name: 'verbose', flags: ['-v'], valueMode: 'none' },
    { name: 'region', flags: ['--region'], valueMode: 'required', valueLabel: 'region' }
  ]
});

// @ts-expect-error switch options cannot have value labels
defineCli({ name: 'ship', options: [{ name: 'verbose', flags: ['-v'], valueMode: 'none', valueLabel: 'level' }] });

// @ts-expect-error option definitions require an explicit value mode
defineCli({ name: 'ship', options: [{ name: 'verbose', flags: ['-v'] }] });

// @ts-expect-error definition objects are closed for object literals
defineCli({ name: 'ship', unsupported: true });

const binder: CliOptionBinder = () => ({
  status: 'bound',
  values: {},
  specified: {},
  positionals: [],
  afterDoubleDash: [],
  unknownFlags: []
});
const parser = createCliInvocationParser(binder);
const invocation: ParsedInvocation = parser.parse(defineCli({ name: 'ship' }));

if (invocation.status === 'parsed') {
  invocation.command.key;
  invocation.optionValues;
  void dispatchCli(invocation, { ship: () => 1 }, undefined);
} else {
  invocation.diagnostics;
  // @ts-expect-error rejected invocations never expose partial option values
  invocation.optionValues;
  // @ts-expect-error dispatch requires a successful invocation
  void dispatchCli(invocation, {}, undefined);
}
