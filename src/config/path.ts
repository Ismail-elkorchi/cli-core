import type { ConfigDiscoveryHost } from './types.ts';

/**
 * Returns default config filenames derived from a program name.
 */
export function defaultConfigFilenames(programName: string): readonly string[] {
  const safeName = programName.replaceAll(/[^A-Za-z0-9._-]/g, '-');
  return Object.freeze([`.${safeName}rc.json`, `${safeName}.config.json`]);
}

/**
 * Returns directories searched for config discovery.
 */
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

/**
 * Joins a config path through host path helpers when available.
 */
export function joinWithHost(host: ConfigDiscoveryHost, directory: string, filename: string): string {
  return normalizePath(host.joinPath?.(directory, filename) ?? joinPath(directory, filename));
}

/**
 * Finds a parent path through host path helpers when available.
 */
export function dirnameWithHost(host: ConfigDiscoveryHost, path: string): string | undefined {
  const parent = host.dirname === undefined ? dirname(path) : host.dirname(path);
  return parent === undefined ? undefined : normalizePath(parent);
}

/**
 * Joins path segments using cli-core path normalization.
 */
export function joinPath(directory: string, filename: string): string {
  if (filename.startsWith('/') || drivePrefix(filename) !== undefined) return normalizePath(filename);
  if (directory === '' || directory === '.') return normalizePath(filename);
  return normalizePath(`${directory.replace(/\/+$/u, '')}/${filename}`);
}

/**
 * Returns the normalized parent path.
 */
export function dirname(path: string): string | undefined {
  const normalized = normalizePath(path);
  const driveRoot = driveRootPath(normalized);
  if (normalized === '/' || normalized === '.' || driveRoot === normalized) return normalized;
  const index = normalized.lastIndexOf('/');
  if (index < 0) return '.';
  if (index === 0) return '/';
  if (driveRoot !== undefined && index === driveRoot.length - 1) return driveRoot;
  return normalized.slice(0, index);
}

/**
 * Normalizes path separators and duplicate segments for config discovery.
 */
export function normalizePath(path: string): string {
  const slashPath = path.replaceAll('\\', '/');
  const drive = drivePrefix(slashPath);
  const pathWithoutDrive = drive === undefined ? slashPath : slashPath.slice(drive.length);
  const absolute = pathWithoutDrive.startsWith('/');
  const parts: string[] = [];
  for (const part of pathWithoutDrive.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') {
        parts.pop();
      } else if (!absolute) {
        parts.push(part);
      }
      continue;
    }
    parts.push(part);
  }
  const normalized = parts.join('/');
  if (drive !== undefined) {
    if (absolute) return `${drive}/${normalized}`;
    return normalized.length === 0 ? drive : `${drive}/${normalized}`;
  }
  if (absolute) return `/${normalized}`;
  return normalized.length === 0 ? '.' : normalized;
}

function drivePrefix(path: string): string | undefined {
  return /^[A-Za-z]:/u.test(path) ? path.slice(0, 2) : undefined;
}

function driveRootPath(path: string): string | undefined {
  const drive = drivePrefix(path);
  return drive === undefined ? undefined : `${drive}/`;
}
