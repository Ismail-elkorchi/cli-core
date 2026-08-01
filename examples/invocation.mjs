import { createCliInvocationParser } from '@ismail-elkorchi/cli-core';

export function createExampleInvocationParser(binding = {}) {
  return createCliInvocationParser(({ options }) => ({
    values: binding.values ?? {},
    present: Object.fromEntries(options.map((option) => [
      option.name,
      binding.present?.includes(option.name) ?? false
    ])),
    positionals: binding.positionals ?? [],
    afterDoubleDash: binding.afterDoubleDash ?? [],
    unknownOptions: binding.unknownOptions ?? [],
    diagnostics: binding.diagnostics ?? []
  }));
}
