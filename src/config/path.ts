import type { ConfigDiscoveryHost } from './types.js';

export function defaultConfigFilenames(programName: string): readonly string[] {
  const safeName = programName.replaceAll(/[^A-Za-z0-9._-]/g, '-');
  return Object.freeze([`.${safeName}rc.json`, `${safeName}.config.json`]);
}

export function candidateDirectories(
  host: ConfigDiscoveryHost,
  cwd: string,
  root: string | undefined
): readonly string[] {
  const directories: string[] = [];
  let current = normalizePath(cwd);
  const boundary = root === undefined ? undefined : normalizePath(root);
  for (;;) {
    directories.push(current);
    if (boundary !== undefined && current === boundary) break;
    const parent = dirnameWithHost(host, current);
    if (parent === undefined || parent === current) break;
    current = parent;
  }
  return Object.freeze(directories);
}

export function joinWithHost(host: ConfigDiscoveryHost, directory: string, filename: string): string {
  return normalizePath(host.joinPath?.(directory, filename) ?? joinPath(directory, filename));
}

export function dirnameWithHost(host: ConfigDiscoveryHost, path: string): string | undefined {
  const parent = host.dirname?.(path) ?? dirname(path);
  return parent === undefined ? undefined : normalizePath(parent);
}

export function joinPath(directory: string, filename: string): string {
  if (filename.startsWith('/')) return normalizePath(filename);
  if (directory === '' || directory === '.') return normalizePath(filename);
  return normalizePath(`${directory.replace(/\/+$/u, '')}/${filename}`);
}

export function dirname(path: string): string | undefined {
  const normalized = normalizePath(path);
  if (normalized === '/' || normalized === '.') return normalized;
  const index = normalized.lastIndexOf('/');
  if (index < 0) return '.';
  if (index === 0) return '/';
  return normalized.slice(0, index);
}

export function normalizePath(path: string): string {
  const absolute = path.startsWith('/');
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  const normalized = parts.join('/');
  if (absolute) return `/${normalized}`;
  return normalized.length === 0 ? '.' : normalized;
}
