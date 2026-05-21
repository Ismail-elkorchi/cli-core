import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCliPluginCommands,
  checkCliPluginCompatibility,
  completeCli,
  createCompletionPayload,
  createCliPluginHost,
  createHelpDocument,
  defineCliPluginManifest,
  parseCli,
  runCli,
  suggestRepairs
} from '../../dist/index.js';
import { describeCli } from '../../dist/manifest/index.js';

test('consumer can validate a plugin manifest and run declared hooks lazily', async () => {
  let loaded = false;
  const manifest = defineCliPluginManifest({
    name: 'ship-audit',
    version: '1.0.0',
    capabilities: ['audit'],
    hooks: [{ name: 'audit-prerun', event: 'prerun' }]
  });
  const compatibility = checkCliPluginCompatibility(manifest, {
    allowedCapabilities: ['audit'],
    runtime: 'node'
  });
  const host = createCliPluginHost([
    {
      manifest,
      load: () => {
        loaded = true;
        return {
          manifest,
          hooks: {
            'audit-prerun': (context) => ({ effects: [{ kind: 'audit.seen', payload: { event: context.event } }] })
          }
        };
      }
    }
  ], { allowedCapabilities: ['audit'] });

  assert.equal(compatibility.ok, true);
  assert.equal(loaded, false);

  const result = await host.runHooks('prerun');

  assert.equal(result.ok, true);
  assert.equal(loaded, true);
  assert.equal(result.hooks[0].effects[0].kind, 'audit.seen');
});

test('plugin-added commands flow through help, manifest, completion, parse, repair, and run planning', async () => {
  const application = applyCliPluginCommands({
    name: 'ship',
    commands: [{ name: 'status' }]
  }, [
    defineCliPluginManifest({
      name: 'ship-audit',
      version: '1.0.0',
      commands: [
        {
          name: 'audit',
          aliases: ['a'],
          description: 'Inspect deployment history.',
          positionals: [{ name: 'service' }],
          options: [{ name: 'json', type: 'boolean', flags: ['--json'] }]
        }
      ]
    })
  ]);
  const program = application.program;
  const help = createHelpDocument(program);
  const manifest = describeCli(program);
  const completion = createCompletionPayload(program, { word: 'a' });
  const bridge = completeCli(program, { words: ['ship', 'a'], cursor: 2 });
  const invocation = parseCli(program, { argv: ['a', '--json', 'api'] });
  const repairs = suggestRepairs(parseCli(program, { argv: ['audt'] }), program);
  const run = await runCli(program, { mode: 'plan', invocation });

  assert.equal(application.ok, true);
  assert.equal(help.commands.find((command) => command.name === 'audit').source.pluginName, 'ship-audit');
  assert.equal(manifest.commands.find((command) => command.path.join(' ') === 'audit').source.pluginName, 'ship-audit');
  assert.equal(completion.items.find((item) => item.value === 'audit').source.pluginName, 'ship-audit');
  assert.equal(bridge.payload.items.find((item) => item.value === 'audit').source.pluginName, 'ship-audit');
  assert.equal(invocation.ok, true);
  assert.equal(invocation.command.source.pluginName, 'ship-audit');
  assert.deepEqual(repairs[0].replacement, ['audit']);
  assert.equal(run.ok, true);
  assert.equal(run.invocation.command.source.pluginName, 'ship-audit');
});
