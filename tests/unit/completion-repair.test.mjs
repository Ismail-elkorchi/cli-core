import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeCli,
  createCompletionCommand,
  createCompletionInstallPlan,
  createCompletionPayload,
  createCompletionRequest,
  createCompletionScript,
  defineCli,
  handleCompletionRequest,
  parseCli,
  suggestRepairs
} from '../../dist/index.js';

const program = defineCli({
  name: 'ship',
  options: [{ name: 'verbose', type: 'boolean', flags: ['--verbose', '-v'] }],
  commands: [
    {
      name: 'deploy',
      aliases: [{ name: 'd', deprecated: 'Use deploy.' }],
      allowPassThrough: true,
      options: [{ name: 'region', type: 'string', flags: ['--region'] }],
      positionals: [{ name: 'service' }],
      commands: [{ name: 'logs', description: 'Show deploy logs.' }]
    }
  ]
});

test('createCompletionPayload returns command, alias, option, and positional candidates', () => {
  const root = createCompletionPayload(program);
  const deploy = createCompletionPayload(program, { commandPath: ['deploy'], word: '--' });

  assert.deepEqual(root.items.map((item) => item.value), ['deploy', 'd', '--verbose', '-v']);
  assert.deepEqual(deploy.items.map((item) => item.value), ['--verbose', '--region']);
});

test('createCompletionScript covers supported shells and install plans are data-only', () => {
  const scripts = ['bash', 'zsh', 'fish', 'pwsh'].map((shell) => createCompletionScript(program, shell));
  const plan = createCompletionInstallPlan(program, 'fish');

  assert.deepEqual(scripts.map((script) => script.shell), ['bash', 'zsh', 'fish', 'pwsh']);
  assert.match(scripts[0].script, /complete -F/);
  assert.match(scripts[1].script, /#compdef ship/);
  assert.match(scripts[2].script, /complete -c 'ship'/);
  assert.match(scripts[3].script, /Register-ArgumentCompleter/);
  assert.equal(plan.steps[0].action, 'write_file');
  assert.equal(plan.steps[1].action, 'source_file');
});

test('completeCli returns contextual command, option, and positional candidates', () => {
  const rootCommands = completeCli(program, { words: ['ship', 'de'], cursor: 2 });
  const rootAliases = completeCli(program, { words: ['ship', 'd'], cursor: 2 });
  const branchCommands = completeCli(program, { words: ['ship', 'deploy', 'l'], cursor: 3 });
  const rootOptions = completeCli(program, { words: ['ship', '--v'], cursor: 2 });
  const localOptions = completeCli(program, { words: ['ship', 'deploy', '--r'], cursor: 3 });
  const positionals = completeCli(program, { words: ['ship', 'deploy', 's'], cursor: 3 });

  assert.deepEqual(rootCommands.payload.items.map((item) => item.value), ['deploy']);
  assert.deepEqual(rootAliases.payload.items.map((item) => item.value), ['deploy', 'd']);
  assert.deepEqual(branchCommands.payload.items.map((item) => item.value), ['logs']);
  assert.deepEqual(rootOptions.payload.items.map((item) => item.value), ['--verbose']);
  assert.deepEqual(localOptions.payload.items.map((item) => item.value), ['--region']);
  assert.deepEqual(positionals.payload.items.map((item) => item.value), ['service']);
});

test('completion bridge protocol normalizes hidden completion requests', () => {
  const command = createCompletionCommand(program);
  const script = createCompletionScript(program, 'bash');
  const request = createCompletionRequest({ words: ['ship', '__complete', 'deploy', '--r'] });
  const response = handleCompletionRequest(program, request);

  assert.equal(command.name, '__complete');
  assert.equal(script.protocol.commandName, command.protocol.commandName);
  assert.match(script.script, /__complete/);
  assert.equal(response.schemaVersion, 'cli-core.completion-response.v1');
  assert.deepEqual(response.payload.items.map((item) => item.value), ['--region']);
});

test('completion bridge stops at pass-through boundaries', () => {
  const response = completeCli(program, {
    words: ['ship', 'deploy', '--', '--not-a-core-option'],
    cursor: 4
  });

  assert.equal(response.boundary, 'pass_through');
  assert.deepEqual(response.payload.items, []);
});

test('suggestRepairs maps invocation diagnostics to stable suggestions', () => {
  const command = suggestRepairs(parseCli(program, { argv: ['deply', 'api'] }), program);
  const missing = suggestRepairs(parseCli(program, { argv: ['deploy'] }), program);
  const deprecated = suggestRepairs(parseCli(program, { argv: ['d', 'api'] }), program);
  const unknown = suggestRepairs(parseCli(program, { argv: ['deploy', '--regin', 'api'] }), program);

  assert.equal(command[0].code, 'REPAIR_UNKNOWN_COMMAND');
  assert.deepEqual(command[0].replacement, ['deploy']);
  assert.equal(missing[0].code, 'REPAIR_MISSING_INPUT');
  assert.equal(deprecated[0].code, 'REPAIR_DEPRECATED_ALIAS');
  assert.equal(unknown[0].code, 'REPAIR_UNKNOWN_OPTION');
  assert.deepEqual(unknown[0].replacement, ['--region']);
});
