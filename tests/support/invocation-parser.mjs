import { createCliDiagnostic } from '../../dist/diagnostics.js';
import { createCliInvocationParser } from '../../dist/index.js';
import { runCli as runCoreCli } from '../../dist/run/index.js';

export * from '../../dist/index.js';

export const testInvocationParser = createCliInvocationParser(bindTestOptions);

export const parseCli = (program, input) => testInvocationParser.parse(program, input);

export const runCli = (program, request = {}) => {
  const { argv, ...rest } = request;
  return runCoreCli(program, {
    ...rest,
    invocation: request.invocation ?? parseCli(program, { argv: argv ?? [] })
  });
};

export function bindTestOptions({ options, argv, argvOffset }) {
  const values = {};
  const present = {};
  const positionals = [];
  const afterDoubleDash = [];
  const unknownOptions = [];
  const diagnostics = [];
  const byFlag = new Map();

  for (const option of options) {
    present[option.name] = false;
    if (option.default !== undefined) {
      values[option.name] = Array.isArray(option.default) ? [...option.default] : option.default;
    }
    for (const flag of option.flags) byFlag.set(flag, { option, value: true });
    if (option.type === 'boolean' && option.allowNo) {
      for (const flag of option.flags) {
        if (flag.startsWith('--')) byFlag.set(`--no-${flag.slice(2)}`, { option, value: false });
      }
    }
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argvElement = argv.at(index);
    if (argvElement === '--') {
      afterDoubleDash.push(...argv.slice(index + 1));
      break;
    }
    if (!argvElement.startsWith('-') || argvElement === '-') {
      positionals.push(argvElement);
      continue;
    }

    const equals = argvElement.indexOf('=');
    const flagArgvIndex = argvOffset + index;
    const flag = equals < 0 ? argvElement : argvElement.slice(0, equals);
    const inlineValue = equals < 0 ? undefined : argvElement.slice(equals + 1);
    const match = byFlag.get(flag);
    if (match === undefined) {
      unknownOptions.push({
        argvElement,
        option: flag,
        argvIndex: flagArgvIndex
      });
      continue;
    }

    const { option, value: booleanValue } = match;
    if (present[option.name] && option.type !== 'array') {
      diagnostics.push(bindingDiagnostic('DUPLICATE', option.name, flag, flagArgvIndex));
      continue;
    }
    present[option.name] = true;

    if (option.type === 'boolean') {
      if (inlineValue !== undefined) {
        diagnostics.push(bindingDiagnostic('UNEXPECTED_VALUE', option.name, flag, flagArgvIndex, inlineValue));
      } else {
        values[option.name] = booleanValue;
      }
      continue;
    }

    let rawValue = inlineValue;
    if (rawValue === undefined) {
      const candidate = argv[index + 1];
      if (candidate === undefined || candidate === '--') {
        diagnostics.push(bindingDiagnostic('MISSING_VALUE', option.name, flag, flagArgvIndex));
        continue;
      }
      rawValue = candidate;
      index += 1;
    }
    if (rawValue.length === 0 && !option.allowEmpty) {
      diagnostics.push(bindingDiagnostic('EMPTY_VALUE', option.name, flag, flagArgvIndex, rawValue));
      continue;
    }

    const decoded = option.type === 'number' ? Number(rawValue) : rawValue;
    if (option.type === 'number' && !Number.isFinite(decoded)) {
      diagnostics.push(bindingDiagnostic('INVALID_VALUE', option.name, flag, flagArgvIndex, rawValue));
      continue;
    }
    if (option.type === 'array') {
      const existing = Array.isArray(values[option.name]) ? values[option.name] : [];
      values[option.name] = [...existing, decoded];
    } else {
      values[option.name] = decoded;
    }
  }

  for (const option of options) {
    if (option.required && !present[option.name]) {
      diagnostics.push(bindingDiagnostic('REQUIRED', option.name, option.flags[0], argvOffset));
    }
  }

  return {
    values,
    present,
    positionals,
    afterDoubleDash,
    unknownOptions,
    diagnostics
  };
}

function bindingDiagnostic(reason, option, flag, argvIndex, rawValue) {
  return createCliDiagnostic(
    'CLI_OPTION_BINDING_FAILED',
    'error',
    'Option input could not be bound.',
    {
      reason,
      option,
      flag,
      argvIndex,
      ...(rawValue === undefined ? {} : { rawValue })
    }
  );
}
