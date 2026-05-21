import { cliCorePackage } from '../../dist/index.js';

if (cliCorePackage.name !== '@ismail-elkorchi/cli-core') {
  throw new Error('Bun runtime could not load package root.');
}
