import {
  applyCliEffects,
  createMemoryEffectHost,
  planCliEffects
} from '@ismail-elkorchi/cli-core/effects';

export async function runEffectsExample() {
  const effects = [
    { kind: 'write_file', path: 'deploy.json', content: '{"ok":true}' },
    { kind: 'spawn', command: 'ship', argv: ['deploy', 'api'], env: { SHIP_TOKEN: 'secret-token' } }
  ];
  const planned = planCliEffects(effects);
  const memory = createMemoryEffectHost();
  const applied = await applyCliEffects({
    effects,
    host: memory.host,
    policy: { allowWriteFile: true, allowSpawn: true }
  });

  return { planned, applied, memory };
}
