import type { DirChordConfig } from './types.js';

export const VERSION = '1.0.0';

export const DEFAULT_CONFIG: Readonly<DirChordConfig> = Object.freeze({
  ignores: ['.git/**', '.DS_Store', 'Thumbs.db'],
  concurrency: 8,
  maxFiles: 250_000,
  maxFileBytes: 8 * 1024 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024 * 1024,
});

export const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
export const MAX_PATH_LENGTH = 4096;
export const MAX_IGNORE_PATTERNS = 2_000;
export const MAX_CONFIGURED_FILES = 2_000_000;
export const MAX_CONFIGURED_BYTES = 1024 * 1024 * 1024 * 1024;
