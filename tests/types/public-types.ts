import {
  createCliInvocation,
  createCliInvocationParser,
  defineCli,
  dispatchCli,
  type CliCommandDefinition,
  type CliDefinition,
  type CliHandlers,
  type CliInvocationResult,
  type CliProgram,
  type CliInvocation,
  type CliOptionBinder,
  type CliInvokableCommandKey,
  type CliScannedOption
} from '../../src/index.ts';

const program = defineCli({
  name: 'ship',
  examples: [{ usage: 'ship deploy --region eu', description: 'Deploy in Europe.' }],
  options: [{ name: 'verbose', kind: 'boolean', flags: ['-v'] }],
  commands: [{
    name: 'deploy',
    options: [{ name: 'region', kind: 'value', flags: ['--region'], valueMode: 'required' }]
  }]
});

// @ts-expect-error boolean options cannot have value labels
defineCli({ name: 'ship', options: [{ name: 'verbose', kind: 'boolean', flags: ['-v'], valueLabel: 'level' }] });

// @ts-expect-error value options require an explicit value mode
defineCli({ name: 'ship', options: [{ name: 'region', kind: 'value', flags: ['--region'] }] });

// @ts-expect-error default labels require a materialized default
defineCli({ name: 'ship', options: [{ name: 'region', kind: 'value', flags: ['--region'], valueMode: 'required', defaultLabel: 'eu' }] });

// @ts-expect-error implicit labels require optional-inline value mode
defineCli({ name: 'ship', options: [{ name: 'region', kind: 'value', flags: ['--region'], valueMode: 'required', implicitValueLabel: 'automatic' }] });

// @ts-expect-error required options cannot declare defaults
defineCli({ name: 'ship', options: [{ name: 'region', kind: 'value', flags: ['--region'], valueMode: 'required', required: true, hasDefault: true }] });

// @ts-expect-error multiple options always use append repetition
defineCli({ name: 'ship', options: [{ name: 'tag', kind: 'value', flags: ['--tag'], valueMode: 'required', multiple: true, repeat: 'first' }] });

// @ts-expect-error definition objects are closed for object literals
defineCli({ name: 'ship', unsupported: true });

// @ts-expect-error example definitions are closed
defineCli({ name: 'ship', examples: [{ usage: 'ship', unsupported: true }] });

const binder: CliOptionBinder = {
  create: () => ({
    next: () => ({ nextIndex: 1, options: [], controlOptions: [], arguments: [], controls: [], afterDoubleDash: [],
      unknownFlags: [], diagnostics: [], unclassified: [] }),
    bind: ({ options }) => ({ status: 'bound', values: {},
      specified: Object.fromEntries(options.map((option) => [option.name, false])) })
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

// Widened children terminate key recursion at every subtree.
const dynamicChildren: readonly import('../../src/index.ts').CliCommandDefinition[] = [{ name: 'deploy' }];
const mixedProgram = defineCli({ name: 'ship', commands: [{ name: 'group', commands: dynamicChildren }] });
const mixedResult = parser.parse(mixedProgram);
if (mixedResult.status === 'ready') {
  const mixedKey: 'ship' | 'ship group' | `ship group ${string}` = mixedResult.commandKey;
  void mixedKey;
}
const broadDefinition: CliDefinition = { name: 'dynamic', commands: dynamicChildren };
const broadResult = parser.parse(defineCli(broadDefinition));
void broadResult;
const partialProgram = defineCli({ name: 'ship', commands: dynamicChildren });
void createCliInvocation(partialProgram, { optionValues: {}, specifiedOptions: {}, positionalValues: {} });

const ownedRoute = parser.route(program);
const boundRoute = parser.bind(ownedRoute);
if (boundRoute.status === 'ready') {
  const key: 'ship' | 'ship deploy' = boundRoute.commandKey;
  void key;
}

// Program identity includes its command definition, not just the root name.
const programA = defineCli({ name: 'tool', commands: [{ name: 'a' }] });
const programB = defineCli({ name: 'tool', commands: [{ name: 'b' }] });
// @ts-expect-error the same root name does not make different command trees interchangeable
const wrongProgram: typeof programA = programB;
void wrongProgram;
const widenedProgram: CliProgram = programA;
void widenedProgram;

function parseGeneric<Definition extends CliDefinition>(
  genericProgram: CliProgram<Definition>
): CliInvocationResult<Definition> {
  return parser.parse(genericProgram);
}
const genericResult = parseGeneric(programA);
if (genericResult.status === 'ready') {
  const key: 'tool' | 'tool a' = genericResult.commandKey;
  void key;
  // @ts-expect-error the other program's child cannot be returned
  const wrongKey: 'tool b' = genericResult.commandKey;
  void wrongKey;
}

// Distributing at the definition boundary preserves root/child correlations.
type CorrelatedDefinition =
  | { readonly name: 'a'; readonly commands: readonly [{ readonly name: 'x' }] }
  | { readonly name: 'b'; readonly commands: readonly [{ readonly name: 'y' }] };
type CorrelatedKey = CliInvokableCommandKey<CorrelatedDefinition>;
const correlatedKeys: readonly CorrelatedKey[] = ['a', 'a x', 'b', 'b y'];
// @ts-expect-error union branches cannot mix root names and children
const crossedKey: CorrelatedKey = 'a y';
void correlatedKeys;
void crossedKey;

function inspectCorrelatedProgram(correlated: CliProgram<CorrelatedDefinition>): void {
  const parsed = parser.parse(correlated);
  const structured = createCliInvocation(correlated, {
    optionValues: {}, specifiedOptions: {}, positionalValues: {}
  });
  for (const result of [parsed, structured]) {
    if (result.status === 'ready') {
      const key: CorrelatedKey = result.commandKey;
      void key;
      if (result.commandKey === 'a x') {
        const command: 'a x' = result.command.key;
        void command;
      }
      // @ts-expect-error impossible cross-product command
      if (result.commandKey === 'a y') throw new Error('impossible');
    } else {
      // @ts-expect-error failure results do not expose successful values
      result.optionValues;
    }
  }
}
void inspectCorrelatedProgram;

// Recursive literal-name subtypes safely widen at the recursive subtree.
interface RecursiveCommand extends CliCommandDefinition {
  readonly name: 'branch';
  readonly commands?: readonly RecursiveCommand[];
}
const recursiveChildren: readonly RecursiveCommand[] = [{ name: 'branch' }];
const recursiveProgram = defineCli({ name: 'tree', commands: recursiveChildren });
const recursiveResult = parser.parse(recursiveProgram);
const recursiveStructured = createCliInvocation(recursiveProgram, {
  optionValues: {}, specifiedOptions: {}, positionalValues: {}
});
for (const result of [recursiveResult, recursiveStructured]) {
  if (result.status === 'ready') {
    const key: 'tree' | 'tree branch' | `tree branch ${string}` = result.commandKey;
    void key;
  }
}
type RecursiveKeys = CliInvokableCommandKey<{ name: 'tree'; commands: readonly RecursiveCommand[] }>;
const recursiveKey: RecursiveKeys = 'tree branch branch branch branch branch';
// @ts-expect-error widening a recursive subtree does not widen its root
const unrelatedRecursiveKey: RecursiveKeys = 'other branch';
void recursiveKey;
void unrelatedRecursiveKey;

// Repeated names in finite trees retain exact keys and invocation discrimination.
const finiteProgram = defineCli({ name: 'tree', commands: [{
  name: 'branch', commands: [{ name: 'branch', commands: [{ name: 'leaf' }] }]
}] });
const finiteResult = parser.parse(finiteProgram);
if (finiteResult.status === 'ready') {
  const key: 'tree' | 'tree branch' | 'tree branch branch' | 'tree branch branch leaf' = finiteResult.commandKey;
  void key;
  if (finiteResult.commandKey === 'tree branch branch leaf') {
    const command: 'tree branch branch leaf' = finiteResult.command.key;
    void command;
  }
  // @ts-expect-error finite trees do not widen merely because command names repeat
  if (finiteResult.commandKey === 'tree branch branch extra') throw new Error('impossible');
}

// A non-invokable root cannot be substituted for an invokable-root definition.
const requiredChildProgram = defineCli({ name: 'tool', invokable: false, commands: [{ name: 'a' }] });
// @ts-expect-error invocation policy is part of the retained definition identity
const wrongInvocationPolicy: typeof requiredChildProgram = programA;
void wrongInvocationPolicy;

interface RecursiveLeft extends CliCommandDefinition {
  readonly name: 'left';
  readonly commands?: readonly RecursiveRight[];
}
interface RecursiveRight extends CliCommandDefinition {
  readonly name: 'right';
  readonly commands?: readonly RecursiveLeft[];
}
type MutualKeys = CliInvokableCommandKey<{ name: 'tree'; commands: readonly RecursiveLeft[] }>;
const mutualKeys: readonly MutualKeys[] = [
  'tree', 'tree left', 'tree left right', 'tree left right left right left'
];
// @ts-expect-error mutually recursive definitions preserve the known leading path
const wrongMutualKey: MutualKeys = 'tree right';
void mutualKeys;
void wrongMutualKey;

const rootOnlyProgram = defineCli({ name: 'tool' });
// @ts-expect-error an extra command must not masquerade as a root-only program
const extraChildAsRoot: typeof rootOnlyProgram = programB;
void extraChildAsRoot;

type OptionalChildrenDefinition = {
  readonly name: 'tool';
  readonly commands?: readonly [{ readonly name: 'b' }];
};
function inspectOptionalChildren(optionalProgram: CliProgram<OptionalChildrenDefinition>): void {
  // @ts-expect-error optional children are still possible invocation targets
  const optionalAsRoot: typeof rootOnlyProgram = optionalProgram;
  void optionalAsRoot;
  const widened: CliProgram = optionalProgram;
  void widened;
}
void inspectOptionalChildren;

type RootOrChildDefinition = { readonly name: 'tool' } | {
  readonly name: 'tool'; readonly commands: readonly [{ readonly name: 'b' }];
};
function inspectRootOrChild(unionProgram: CliProgram<RootOrChildDefinition>): void {
  // @ts-expect-error union branches with extra children cannot become root-only
  const unionAsRoot: typeof rootOnlyProgram = unionProgram;
  void unionAsRoot;
  const widened: CliProgram = unionProgram;
  void widened;
}
void inspectRootOrChild;

// Dynamic recursion may change its literal name at every level.
interface GrowingCommand<Name extends string> extends CliCommandDefinition {
  readonly name: Name;
  readonly commands?: readonly GrowingCommand<`${Name}x`>[];
}
type GrowingDefinition = { readonly name: 'tool'; readonly commands: readonly GrowingCommand<'x'>[] };
type GrowingKeys = CliInvokableCommandKey<GrowingDefinition>;
const growingKeys: readonly GrowingKeys[] = ['tool', 'tool x', 'tool x xx xxx xxxx'];
// @ts-expect-error recursive widening retains the known first command name
const wrongGrowingKey: GrowingKeys = 'tool y';
void growingKeys;
void wrongGrowingKey;
function inspectGrowing(growing: CliProgram<GrowingDefinition>): void {
  const result = parseGeneric(growing);
  if (result.status === 'ready') {
    const key: 'tool' | 'tool x' | `tool x ${string}` = result.commandKey;
    void key;
  }
  const broad: CliProgram = growing;
  void broad;
}
void inspectGrowing;

const explicitInvokableRoot = defineCli({ name: 'tool', invokable: true });
const compatibleRoot: typeof rootOnlyProgram = explicitInvokableRoot;
void compatibleRoot;

const finiteParentProgram = defineCli({ name: 'tool', commands: [{ name: 'parent' }] });
type OptionalGrandchildrenDefinition = {
  readonly name: 'tool';
  readonly commands: readonly [{ readonly name: 'parent'; readonly commands?: readonly [{ readonly name: 'leaf' }] }];
};
function inspectOptionalGrandchildren(nested: CliProgram<OptionalGrandchildrenDefinition>): void {
  // @ts-expect-error nested optional descendants are still possible invocation targets
  const nestedAsFinite: typeof finiteParentProgram = nested;
  void nestedAsFinite;
}
void inspectOptionalGrandchildren;

const optionalRoot: CliProgram<OptionalChildrenDefinition> = rootOnlyProgram;
const rootOrChild: CliProgram<RootOrChildDefinition> = programB;
void optionalRoot;
void rootOrChild;

// Optional tuple children also describe dynamic, potentially recursive trees.
interface RecursiveTupleCommand extends CliCommandDefinition {
  readonly name: 'branch';
  readonly commands?: readonly [RecursiveTupleCommand];
}
type RecursiveTupleKeys = CliInvokableCommandKey<{
  name: 'tree'; commands: readonly [RecursiveTupleCommand]
}>;
const recursiveTupleKeys: readonly RecursiveTupleKeys[] = [
  'tree', 'tree branch', 'tree branch branch', 'tree branch branch branch branch'
];
void recursiveTupleKeys;
interface GrowingTupleCommand<Name extends string> extends CliCommandDefinition {
  readonly name: Name;
  readonly commands?: readonly [GrowingTupleCommand<`${Name}x`>];
}
type GrowingTupleKeys = CliInvokableCommandKey<{
  name: 'tree'; commands: readonly [GrowingTupleCommand<'x'>]
}>;
const growingTupleKeys: readonly GrowingTupleKeys[] = ['tree', 'tree x', 'tree x xx xxx xxxx'];
// @ts-expect-error optional tuple widening preserves the known prefix
const wrongGrowingTupleKey: GrowingTupleKeys = 'tree y';
void growingTupleKeys;
void wrongGrowingTupleKey;

// Union-valued tuple collections can terminate recursion without being optional.
interface TerminatingTupleCommand<Name extends string> extends CliCommandDefinition {
  readonly name: Name;
  readonly commands: readonly [] | readonly [TerminatingTupleCommand<`${Name}x`>];
}
type TerminatingTupleKeys = CliInvokableCommandKey<{
  name: 'tree'; commands: readonly [TerminatingTupleCommand<'x'>]
}>;
const terminatingTupleKeys: readonly TerminatingTupleKeys[] = ['tree', 'tree x', 'tree x xx xxx xxxx'];
// @ts-expect-error terminating tuple recursion retains the known prefix
const wrongTerminatingTupleKey: TerminatingTupleKeys = 'tree y';
void terminatingTupleKeys;
void wrongTerminatingTupleKey;

// A dynamic tuple slot can choose a recursive child or a terminal leaf.
interface UnionSlotCommand<Name extends string> extends CliCommandDefinition {
  readonly name: Name;
  readonly commands: readonly [UnionSlotCommand<`${Name}x`> | { readonly name: 'leaf' }];
}
type UnionSlotKeys = CliInvokableCommandKey<{
  name: 'tree'; commands: readonly [UnionSlotCommand<'x'>]
}>;
const unionSlotKeys: readonly UnionSlotKeys[] = [
  'tree', 'tree x', 'tree x leaf', 'tree x xx xxx leaf'
];
void unionSlotKeys;

const finiteSiblingProgram = defineCli({ name: 'tree', commands: [
  { name: 'left', commands: [{ name: 'leaf' }] },
  { name: 'right', commands: [{ name: 'twig' }] }
] });
const finiteSiblingResult = parser.parse(finiteSiblingProgram);
if (finiteSiblingResult.status === 'ready') {
  const key: 'tree' | 'tree left' | 'tree left leaf' | 'tree right' | 'tree right twig' = finiteSiblingResult.commandKey;
  void key;
  // @ts-expect-error multiple fixed tuple entries do not widen their descendants
  if (finiteSiblingResult.commandKey === 'tree left twig') throw new Error('impossible');
}
