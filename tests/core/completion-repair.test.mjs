import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeCli,
  createCompletionPayload,
  defineCli,
  parseCli
} from '../support/invocation-parser.mjs';
import { createCliDiagnostic } from '../../dist/diagnostics.js';
import {
  createCompletionCommand,
  createCompletionInstallPlan,
  createCompletionRequest,
  createCompletionScript
} from '../../dist/completion/index.js';
import { createRepairSuggestionResult } from '../../dist/repair/index.js';

const program = defineCli({
  name: 'ship',
  options: [
    { name: 'verbose', type: 'boolean', flags: ['--verbose', '-v'] },
    { name: 'token', type: 'string', flags: ['--token'], hidden: true }
  ],
  commands: [
    {
      name: 'deploy',
      aliases: [{ name: 'd', deprecated: 'Use deploy.' }],
      allowPassThrough: true,
      options: [
        { name: 'region', type: 'string', flags: ['--region'] },
        { name: 'secret', type: 'string', flags: ['--secret'], hidden: true }
      ],
      positionals: [{ name: 'service' }],
      commands: [
        { name: 'logs', aliases: ['l'], description: 'Show deploy logs.' },
        { name: 'tail', aliases: [{ name: 't', deprecated: true }], description: 'Tail deploy logs.' }
      ]
    }
  ]
});

test('createCompletionPayload returns command, alias, option, and positional candidates', () => {
  const root = createCompletionPayload(program);
  const deploy = createCompletionPayload(program, { commandPath: ['deploy'], word: '--' });
  const deployPositionals = createCompletionPayload(program, { commandPath: ['deploy'], word: 's' });
  const optionalPositionals = createCompletionPayload(defineCli({
    name: 'files',
    commands: [{ name: 'watch', aliases: ['w'], positionals: [{ name: 'paths', required: false }] }]
  }), { commandPath: ['watch'], word: 'p' });
  const activeAlias = createCompletionPayload(defineCli({
    name: 'files',
    commands: [{ name: 'watch', aliases: ['w'] }]
  }), { commandPath: ['watch'], word: 'w' });
  const hiddenRoot = createCompletionPayload(program, { word: '--', includeHidden: true });
  const hiddenDeploy = createCompletionPayload(program, { commandPath: ['deploy'], word: '--', includeHidden: true });
  const deprecatedAlias = createCompletionPayload(program, { commandPath: ['deploy'], word: 'd' });
  const rooted = createCompletionPayload(defineCli({
    name: 'rooted',
    commands: [{ name: 'Stryker was here' }]
  }));

  assert.deepEqual(root.items.map((item) => item.value), ['deploy', 'd', '--verbose', '-v']);
  assert.deepEqual(root.commandPath, []);
  assert.deepEqual(rooted.commandPath, []);
  assert.deepEqual(root.items.map((item) => item.kind), ['command', 'alias', 'option', 'option']);
  assert.equal(root.items[1].description, 'Deprecated alias for deploy.');
  assert.deepEqual(deploy.items.map((item) => item.value), ['--verbose', '--region']);
  assert.deepEqual(deploy.commandPath, ['deploy']);
  assert.deepEqual(deployPositionals.items.map((item) => [item.kind, item.value, item.label]), [['positional', 'service', '<service>']]);
  assert.deepEqual(optionalPositionals.items.map((item) => [item.kind, item.value, item.label]), [['positional', 'paths', '[paths]']]);
  assert.deepEqual(activeAlias.items, [
    {
      kind: 'alias',
      value: 'w',
      label: 'w',
      description: undefined
    }
  ]);
  assert.deepEqual(hiddenRoot.items.map((item) => item.value), ['--verbose', '--token']);
  assert.deepEqual(hiddenDeploy.items.map((item) => item.value), ['--verbose', '--token', '--region', '--secret']);
  assert.deepEqual(deprecatedAlias.items, [
    {
      kind: 'alias',
      value: 'd',
      label: 'd',
      description: 'Deprecated alias.'
    }
  ]);
  assert.deepEqual(createCompletionPayload(program, { commandPath: ['missing'] }).commandPath, []);
});

test('createCompletionScript covers supported shells and install plans are data-only', () => {
  const scripts = ['bash', 'zsh', 'fish', 'pwsh'].map((shell) => createCompletionScript(program, shell));
  const plan = createCompletionInstallPlan(program, 'fish');
  const bashPlan = createCompletionInstallPlan(program, 'bash');
  const zshPlan = createCompletionInstallPlan(program, 'zsh');
  const pwshPlan = createCompletionInstallPlan(program, 'pwsh');
  const quoted = defineCli({ name: "ship's tool" });
  const punctuation = defineCli({ name: '!!!' });
  const bashScript = createCompletionScript(quoted, 'bash');
  const pwshScript = createCompletionScript(quoted, 'pwsh');
  const punctuationScript = createCompletionScript(punctuation, 'bash');
  const punctuationPlan = createCompletionInstallPlan(punctuation, 'bash');

  assert.deepEqual(scripts.map((script) => script.shell), ['bash', 'zsh', 'fish', 'pwsh']);
  assert.match(scripts[0].script, /complete -F/);
  assert.match(scripts[1].script, /#compdef ship/);
  assert.match(scripts[2].script, /complete -c 'ship'/);
  assert.match(scripts[3].script, /Register-ArgumentCompleter/);
  assert.equal(plan.steps[0].action, 'write_file');
  assert.equal(plan.steps[0].path, '~/.config/fish/completions/ship.fish');
  assert.equal(plan.steps[1].action, 'source_file');
  assert.equal(plan.steps[1].path, '~/.config/fish/completions/ship.fish');
  assert.equal(bashPlan.steps[0].path, '~/.bash_completion.d/ship');
  assert.equal(bashPlan.steps[1].action, 'add_to_profile');
  assert.equal(bashPlan.steps[1].path, '~/.bashrc');
  assert.equal(bashPlan.steps[1].content, 'source ~/.bash_completion.d/ship');
  assert.equal(zshPlan.steps[0].path, '~/.zsh/completions/_ship');
  assert.equal(zshPlan.steps[1].action, 'add_to_profile');
  assert.equal(zshPlan.steps[1].path, '~/.zshrc');
  assert.match(zshPlan.steps[1].content ?? '', /fpath=\(~\/\.zsh\/completions \$fpath\)/);
  assert.equal(pwshPlan.steps[0].path, '$HOME/.config/powershell/completions/ship.ps1');
  assert.equal(pwshPlan.steps[1].action, 'add_to_profile');
  assert.equal(pwshPlan.steps[1].path, '$PROFILE');
  assert.equal(pwshPlan.steps[1].content, '. "$HOME/.config/powershell/completions/ship.ps1"');
  assert.match(bashScript.script, /'ship'\\''s tool'/);
  assert.match(bashScript.script, /_ship_s_tool_completion/);
  assert.match(pwshScript.script, /'ship''s tool'/);
  assert.match(punctuationScript.script, /____completion/);
  assert.equal(punctuationPlan.steps[0].path, '~/.bash_completion.d/___');
});

test('completeCli returns contextual command, option, and positional candidates', () => {
  const rootCommands = completeCli(program, { words: ['ship', 'de'], cursor: 2 });
  const rootAliases = completeCli(program, { words: ['ship', 'd'], cursor: 2 });
  const branchCommands = completeCli(program, { words: ['ship', 'deploy', 'l'], cursor: 3 });
  const rootOptions = completeCli(program, { words: ['ship', '--v'], cursor: 2 });
  const localOptions = completeCli(program, { words: ['ship', 'deploy', '--r'], cursor: 3 });
  const aliasLocalOptions = completeCli(program, { words: ['ship', 'd', '--r'], cursor: 3 });
  const hiddenLocalOptions = completeCli(program, { words: ['ship', 'deploy', '--s'], cursor: 3, includeHidden: true });
  const hiddenLocalOptionsBlocked = completeCli(program, { words: ['ship', 'deploy', '--s'], cursor: 3 });
  const positionals = completeCli(program, { words: ['ship', 'deploy', 's'], cursor: 3 });
  const optionalBridge = completeCli(defineCli({
    name: 'files',
    commands: [{ name: 'watch', positionals: [{ name: 'paths', required: false }] }]
  }), { words: ['files', 'watch', 'p'], cursor: 3 });
  const childAliases = completeCli(program, { words: ['ship', 'deploy', 'l'], cursor: 3 });
  const deprecatedChildAlias = completeCli(program, { words: ['ship', 'deploy', 't'], cursor: 3 });
  const leadingOption = completeCli(program, { words: ['ship', '--v'], cursor: 2 });
  const multiChildProgram = defineCli({
    name: 'multi',
    commands: [
      { name: 'alpha', aliases: ['a'], options: [{ name: 'alphaOnly', type: 'boolean', flags: ['--alpha'] }] },
      { name: 'beta', aliases: ['b', 'bee'], options: [{ name: 'betaOnly', type: 'boolean', flags: ['--beta'] }] }
    ]
  });
  const aliasContext = completeCli(multiChildProgram, { words: ['multi', 'b', '--b'], cursor: 3 });
  const noProgramPrefix = completeCli(program, { words: ['deploy', '--r'], cursor: 2 });

  assert.deepEqual(rootCommands.payload.items.map((item) => item.value), ['deploy']);
  assert.deepEqual(rootAliases.payload.items.map((item) => item.value), ['deploy', 'd']);
  assert.deepEqual(branchCommands.payload.items.map((item) => item.value), ['logs', 'l']);
  assert.deepEqual(rootOptions.payload.items.map((item) => item.value), ['--verbose']);
  assert.deepEqual(localOptions.payload.items.map((item) => item.value), ['--region']);
  assert.deepEqual(aliasLocalOptions.payload.items.map((item) => item.value), ['--region']);
  assert.deepEqual(hiddenLocalOptions.payload.items.map((item) => item.value), ['--secret']);
  assert.deepEqual(hiddenLocalOptionsBlocked.payload.items, []);
  assert.deepEqual(positionals.payload.items.map((item) => [item.kind, item.value, item.label]), [['positional', 'service', '<service>']]);
  assert.deepEqual(optionalBridge.payload.items.map((item) => [item.kind, item.value, item.label]), [['positional', 'paths', '[paths]']]);
  assert.deepEqual(childAliases.payload.items.map((item) => [item.kind, item.value, item.description]), [
    ['command', 'logs', 'Show deploy logs.'],
    ['alias', 'l', 'Alias for deploy logs.']
  ]);
  assert.deepEqual(deprecatedChildAlias.payload.items.map((item) => [item.kind, item.value, item.description]), [
    ['command', 'tail', 'Tail deploy logs.'],
    ['alias', 't', 'Deprecated alias for deploy tail.']
  ]);
  assert.deepEqual(leadingOption.payload.commandPath, []);
  assert.deepEqual(leadingOption.payload.items.map((item) => item.value), ['--verbose']);
  assert.deepEqual(aliasContext.payload.commandPath, ['beta']);
  assert.deepEqual(aliasContext.payload.items.map((item) => item.value), ['--beta']);
  assert.deepEqual(noProgramPrefix.payload.commandPath, ['deploy']);
  assert.deepEqual(noProgramPrefix.payload.items.map((item) => item.value), ['--region']);
});

test('completion bridge protocol normalizes hidden completion requests', () => {
  const command = createCompletionCommand(program);
  const script = createCompletionScript(program, 'bash');
  const request = createCompletionRequest({ words: ['ship', '__complete', 'deploy', '--r'] });
  const arrayRequest = createCompletionRequest(['ship', '__complete', 'deploy', '--r']);
  const hiddenRequest = createCompletionRequest({ words: ['ship', '__complete', 'deploy', '--s'], includeHidden: true });
  const pastEnd = createCompletionRequest({ words: ['ship', 'deploy'], cursor: 20 });
  const negative = createCompletionRequest({ words: ['ship', 'deploy'], cursor: -1 });
  const fractional = createCompletionRequest({ words: ['ship', 'deploy'], cursor: 1.8 });
  const notFinite = createCompletionRequest({ words: ['ship', 'deploy'], cursor: Number.NaN });
  const emptyObjectRequest = createCompletionRequest({});
  const response = completeCli(program, request);
  const hiddenResponse = completeCli(program, hiddenRequest);
  const plainInputResponse = completeCli(program, { currentWord: '--v' });
  const protocolCursor = completeCli(program, {
    words: ['ship', '__complete', 'deploy'],
    cursor: 1,
    currentWord: 'ship'
  });
  const wrongSchemaInput = completeCli(program, {
    schemaVersion: 'not-a-completion-request',
    words: ['ship', '--v'],
    cursor: 2,
    currentWord: '--v'
  });

  assert.equal(command.name, '__complete');
  assert.equal(script.protocol.commandName, command.protocol.commandName);
  assert.match(script.script, /__complete/);
  assert.deepEqual(arrayRequest.words, ['ship', '__complete', 'deploy', '--r']);
  assert.equal(arrayRequest.currentWord, '--r');
  assert.equal(arrayRequest.cursor, 4);
  assert.equal(arrayRequest.includeHidden, false);
  assert.equal(pastEnd.cursor, 2);
  assert.equal(pastEnd.currentWord, 'deploy');
  assert.equal(negative.cursor, 0);
  assert.equal(negative.currentWord, '');
  assert.equal(fractional.cursor, 1);
  assert.equal(fractional.currentWord, 'ship');
  assert.equal(notFinite.cursor, 2);
  assert.equal(notFinite.currentWord, 'deploy');
  assert.deepEqual(emptyObjectRequest.words, []);
  assert.equal(emptyObjectRequest.currentWord, '');
  assert.equal(emptyObjectRequest.cursor, 0);
  assert.equal(response.schemaVersion, 'cli-core.completion-response.v1');
  assert.equal(response.request, request);
  assert.deepEqual(response.payload.commandPath, ['deploy']);
  assert.deepEqual(response.payload.items.map((item) => item.value), ['--region']);
  assert.deepEqual(hiddenResponse.payload.items.map((item) => item.value), ['--secret']);
  assert.deepEqual(plainInputResponse.payload.items.map((item) => item.value), ['--verbose']);
  assert.deepEqual(protocolCursor.payload.commandPath, []);
  assert.deepEqual(wrongSchemaInput.payload.items.map((item) => item.value), ['--verbose']);
});

test('completion bridge stops at pass-through boundaries', () => {
  const response = completeCli(program, {
    words: ['ship', 'deploy', '--', '--r'],
    cursor: 4
  });
  const leadingBoundary = completeCli(program, {
    words: ['ship', '__complete', '--', '--v'],
    cursor: 4
  });
  const atSeparator = completeCli(program, {
    words: ['ship', 'deploy', '--'],
    cursor: 3
  });

  assert.equal(response.boundary, 'pass_through');
  assert.deepEqual(response.payload.items, []);
  assert.equal(leadingBoundary.boundary, 'pass_through');
  assert.deepEqual(leadingBoundary.payload.items, []);
  assert.equal(atSeparator.boundary, 'cli');
  assert.deepEqual(atSeparator.payload.items.map((item) => item.value), ['--verbose', '--region']);
});

test('createRepairSuggestionResult maps invocation diagnostics to stable suggestions', () => {
  const commandResult = createRepairSuggestionResult(parseCli(program, { argv: ['deply'] }), program);
  const command = commandResult.suggestions;
  const commandWithoutProgram = createRepairSuggestionResult(parseCli(program, { argv: ['deply'] })).suggestions;
  const farCommand = createRepairSuggestionResult(parseCli(program, { argv: ['zzzzzzzz'] }), program).suggestions;
  const missing = createRepairSuggestionResult(parseCli(program, { argv: ['deploy'] }), program).suggestions;
  const deprecated = createRepairSuggestionResult(parseCli(program, { argv: ['d', 'api'] }), program).suggestions;
  const unknown = createRepairSuggestionResult(parseCli(program, { argv: ['deploy', '--regin', 'api'] }), program).suggestions;
  const hidden = createRepairSuggestionResult(parseCli(program, { argv: ['deploy', '--secre', 'api'] }), program).suggestions;
  const passThrough = createRepairSuggestionResult(parseCli(defineCli({ name: 'proxy', commands: [{ name: 'run' }] }), {
    argv: ['run', '--', '--foreign']
  })).suggestions;
  const filteredDeprecated = createRepairSuggestionResult({
    diagnostics: [
      createCliDiagnostic('CLI_DEPRECATED_ALIAS', 'warning', 'Deprecated alias.', {
        commandPath: ['deploy', 1, 'logs']
      })
    ]
  }).suggestions;
  const malformedDeprecated = createRepairSuggestionResult({
    diagnostics: [
      createCliDiagnostic('CLI_DEPRECATED_ALIAS', 'warning', 'Deprecated alias.', {
        commandPath: 'deploy'
      })
    ]
  }).suggestions;
  const mixedUnknownCommand = createRepairSuggestionResult({
    diagnostics: [
      createCliDiagnostic('CLI_UNKNOWN_COMMAND', 'error', 'Unknown command.', {
        commandPath: ['deploy', 1, 'tail']
      })
    ]
  }, program).suggestions;
  const malformedUnknownCommand = createRepairSuggestionResult({
    diagnostics: [
      createCliDiagnostic('CLI_UNKNOWN_COMMAND', 'error', 'Unknown command.', {
        commandPath: 'deploy'
      })
    ]
  }, program).suggestions;
  const malformedUnknownOption = createRepairSuggestionResult({
    command: undefined,
    diagnostics: [
      createCliDiagnostic('CLI_UNKNOWN_OPTION', 'error', 'Unknown option.', {
        option: 1
      })
    ]
  }).suggestions;

  assert.equal(command[0].code, 'REPAIR_UNKNOWN_COMMAND');
  assert.equal(command[0].title, 'Unknown command');
  assert.equal(command[0].detail, 'Use a declared command path or ask for completion candidates.');
  assert.deepEqual(command[0].replacement, ['deploy']);
  assert.equal(command[0].rank, 0);
  assert.deepEqual(command[0].evidence, [{ kind: 'edit_distance', value: 'deply', candidate: 'deploy', distance: 1 }]);
  assert.equal(commandResult.schemaVersion, 'cli-core.repair-suggestions.v1');
  assert.equal(commandResult.hasSuggestions, true);
  assert.equal(commandResult.suggestions[0].code, 'REPAIR_UNKNOWN_COMMAND');
  assert.equal(commandResult.diagnostics[0].code, 'CLI_UNKNOWN_COMMAND');
  assert.deepEqual(commandWithoutProgram[0].replacement, []);
  assert.deepEqual(farCommand[0].replacement, []);
  assert.equal(missing[0].code, 'REPAIR_MISSING_INPUT');
  assert.equal(missing[0].title, 'Missing input');
  assert.equal(missing[0].detail, 'Provide the required positional input.');
  assert.deepEqual(missing[0].replacement, []);
  assert.equal(deprecated[0].code, 'REPAIR_DEPRECATED_ALIAS');
  assert.equal(deprecated[0].title, 'Deprecated alias');
  assert.equal(deprecated[0].detail, 'Use the canonical command path.');
  assert.deepEqual(deprecated[0].replacement, ['deploy']);
  assert.equal(unknown[0].code, 'REPAIR_UNKNOWN_OPTION');
  assert.equal(unknown[0].title, 'Unknown option');
  assert.equal(unknown[0].detail, 'Remove the option or use a declared flag for the matched command.');
  assert.deepEqual(unknown[0].replacement, ['--region']);
  assert.deepEqual(hidden[0].replacement, []);
  assert.equal(passThrough[0].code, 'REPAIR_PASS_THROUGH');
  assert.equal(passThrough[0].title, 'Pass-through preserved');
  assert.equal(passThrough[0].detail, 'Tokens after -- were preserved and can be forwarded explicitly.');
  assert.deepEqual(passThrough[0].replacement, ['--']);
  assert.deepEqual(filteredDeprecated[0].replacement, ['deploy', 'logs']);
  assert.deepEqual(malformedDeprecated[0].replacement, []);
  assert.deepEqual(mixedUnknownCommand[0].replacement, ['deploy', 'tail']);
  assert.deepEqual(malformedUnknownCommand[0].replacement, []);
  assert.deepEqual(malformedUnknownOption[0].replacement, []);
});
