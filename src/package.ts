/**
 * Package metadata exposed by the root entrypoint.
 */
export interface CliCorePackage {
  /** Published package name. */
  readonly name: '@ismail-elkorchi/cli-core';
  /** Published package version. */
  readonly version: '0.1.0';
  /** Version of the public cli-core contract. */
  readonly contractVersion: '0.1.0';
}

/**
 * Package metadata for cli-core.
 */
export const cliCorePackage: CliCorePackage = Object.freeze({
  name: '@ismail-elkorchi/cli-core',
  version: '0.1.0',
  contractVersion: '0.1.0'
});
