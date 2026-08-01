import {
  createCliMain as createCoreCliMain,
  runCliMain as runCoreCliMain
} from '../../dist/adapter/index.js';
import { testInvocationParser } from './invocation-parser.mjs';

export * from '../../dist/adapter/index.js';

export const createCliMain = (request) => createCoreCliMain({
  parser: testInvocationParser,
  ...request
});

export const runCliMain = (request, host) => runCoreCliMain({
  parser: testInvocationParser,
  ...request
}, host);
