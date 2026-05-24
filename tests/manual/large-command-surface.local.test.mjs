import test from 'node:test';
import { runLargeCommandSurfaceCase } from './large-command-surface-case.mjs';

test('generated 128-command fixture exercises indexed lookup, manifest, completion, and repair paths', () => {
  runLargeCommandSurfaceCase(128);
});
