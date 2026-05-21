import {
  createCliMain,
  createNodeCliAdapter,
  defineCli
} from '@ismail-elkorchi/cli-core';

export async function runCliMainExample() {
  const program = defineCli({
    name: 'ship',
    commands: [{ name: 'deploy', positionals: [{ name: 'service' }] }]
  });
  const processLike = {
    argv: ['node', 'ship.mjs', 'deploy', 'api'],
    stdout: { chunks: [], write(chunk) { this.chunks.push(chunk); } },
    stderr: { chunks: [], write(chunk) { this.chunks.push(chunk); } },
    exitCode: -1
  };
  const main = createCliMain({
    program,
    mode: 'plan',
    effects: [{ kind: 'write_file', path: 'plan.json', content: '{"service":"api"}' }],
    effectMode: 'plan',
    handlers: {
      deploy: () => ({
        artifacts: [{ id: 'deploy-summary', kind: 'json', payload: { service: 'api' } }]
      })
    }
  });
  const result = await main(createNodeCliAdapter(processLike));

  return { result, processLike };
}
