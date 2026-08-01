import assert from 'node:assert/strict';
import test from 'node:test';
import { defineCli, parseCli } from '../support/invocation-parser.mjs';

test('command index lookup remains deterministic for a generated command set', () => {
  const commands = Array.from({ length: 24 }, (_unused, index) => ({
    name: `command-${index}`,
    aliases: [`c${index}`],
    options: [{ name: `enabled${index}`, type: 'boolean', flags: [`--enabled-${index}`] }]
  }));
  const program = defineCli({ name: 'generated', commands });

  assert.equal(program.diagnostics.length, 0);
  assert.equal(program.pathIndex.length, 25);
  assert.equal(program.aliasIndex.length, 24);

  for (let index = 0; index < commands.length; index += 1) {
    const invocation = parseCli(program, {
      argv: [`c${index}`, `--enabled-${index}`]
    });
    assert.equal(invocation.ok, true);
    assert.deepEqual(invocation.commandPath, [`command-${index}`]);
    assert.equal(invocation.options.values[`enabled${index}`], true);
  }
});
