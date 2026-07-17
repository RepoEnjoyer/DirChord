import path from 'node:path';
import { MAX_PATH_LENGTH } from './constants.js';
import { DirChordError } from './errors.js';

export function toPortablePath(value: string): string {
  return value.split(path.sep).join('/').normalize('NFC');
}

export function comparePortableText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function relativePortablePath(root: string, absolutePath: string): string {
  const relative = toPortablePath(path.relative(root, absolutePath));
  assertSafeManifestPath(relative);
  return relative;
}

export function assertSafeManifestPath(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new DirChordError('INVALID_MANIFEST', 'Every manifest entry needs a non-empty path.');
  }
  if (value.length > MAX_PATH_LENGTH) {
    throw new DirChordError(
      'INVALID_MANIFEST',
      `Manifest paths cannot exceed ${MAX_PATH_LENGTH.toLocaleString()} characters.`,
    );
  }
  if (value.includes('\0') || value.includes('\\')) {
    throw new DirChordError('INVALID_MANIFEST', 'Manifest paths must use safe forward-slash separators.');
  }
  if (value !== value.normalize('NFC')) {
    throw new DirChordError('INVALID_MANIFEST', 'Manifest paths must use NFC Unicode normalization.');
  }
  if (value.startsWith('/') || /^[A-Za-z]:\//u.test(value)) {
    throw new DirChordError('INVALID_MANIFEST', 'Manifest paths must be relative.');
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new DirChordError('INVALID_MANIFEST', 'Manifest paths cannot contain empty, dot, or parent segments.');
  }
}
