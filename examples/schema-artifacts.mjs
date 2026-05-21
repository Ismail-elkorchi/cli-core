import { defineCli, describeCli } from '../dist/index.js';
import { describeCliSchemas } from '../dist/schema/index.js';
import schemaIndex from '../schemas/index.json' with { type: 'json' };
import manifestSchema from '../schemas/command-manifest.schema.json' with { type: 'json' };

export async function runSchemaArtifactsExample() {
  const program = defineCli({
    name: 'ship',
    commands: [{ name: 'deploy', description: 'Deploy a service.' }]
  });
  const manifest = describeCli(program);

  return {
    registry: describeCliSchemas(),
    index: schemaIndex,
    manifest,
    manifestSchema
  };
}
