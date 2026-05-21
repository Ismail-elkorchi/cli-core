import { cliCorePackage } from '../../dist/index.js';
import { describeCliSchemas } from '../../dist/schema/index.js';

if (cliCorePackage.name !== '@ismail-elkorchi/cli-core') {
  throw new Error('Bun runtime could not load package root.');
}

if (!describeCliSchemas().some((schema) => schema.version === 'cli-core.schema-envelope.v1')) {
  throw new Error('Bun runtime could not load schema subpath.');
}
