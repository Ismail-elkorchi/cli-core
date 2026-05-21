import {
  createHelpDocument,
  createVersionDocument,
  defineCli,
  describeCli
} from '@ismail-elkorchi/cli-core';
import {
  exportCommandManifest,
  importCommandManifest
} from '@ismail-elkorchi/cli-core/manifest';

export function runHelpManifestExample() {
  const program = defineCli({
    name: 'ship',
    version: '2.0.0',
    commands: [{ name: 'status', aliases: ['st'], description: 'Show service status.' }]
  });
  const manifestText = exportCommandManifest(describeCli(program));

  return {
    help: createHelpDocument(program),
    version: createVersionDocument(program),
    manifest: importCommandManifest(manifestText)
  };
}
