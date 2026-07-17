import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_CONFIG,
  MAX_CONFIGURED_BYTES,
  MAX_CONFIGURED_FILES,
  MAX_IGNORE_PATTERNS,
} from './constants.js';
import { DirChordError } from './errors.js';
import { normalizePattern } from './glob.js';
import type { DirChordConfig } from './types.js';

type UnknownRecord = Record<string, unknown>;

async function exists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function assertRecord(value: unknown): asserts value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DirChordError('INVALID_CONFIG', 'Configuration must be a JSON object.');
  }
}

function boundedInteger(
  value: unknown,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new DirChordError(
      'INVALID_CONFIG',
      `${name} must be a whole number between ${minimum.toLocaleString()} and ${maximum.toLocaleString()}.`,
    );
  }
  return value as number;
}

export function validateConfig(value: unknown): DirChordConfig {
  assertRecord(value);
  const allowed = new Set([
    'ignores',
    'concurrency',
    'maxFiles',
    'maxFileBytes',
    'maxTotalBytes',
  ]);
  const unknownKeys = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) {
    throw new DirChordError(
      'INVALID_CONFIG',
      `Unknown configuration ${unknownKeys.length === 1 ? 'key' : 'keys'}: ${unknownKeys.join(', ')}.`,
    );
  }

  const ignoresValue = value.ignores ?? DEFAULT_CONFIG.ignores;
  if (!Array.isArray(ignoresValue) || ignoresValue.some((item) => typeof item !== 'string')) {
    throw new DirChordError('INVALID_CONFIG', 'ignores must be an array of strings.');
  }
  if (ignoresValue.length > MAX_IGNORE_PATTERNS) {
    throw new DirChordError(
      'INVALID_CONFIG',
      `ignores cannot contain more than ${MAX_IGNORE_PATTERNS.toLocaleString()} patterns.`,
    );
  }

  return {
    ignores: ignoresValue.map((item) => normalizePattern(item as string)),
    concurrency: boundedInteger(value.concurrency, 'concurrency', DEFAULT_CONFIG.concurrency, 1, 64),
    maxFiles: boundedInteger(value.maxFiles, 'maxFiles', DEFAULT_CONFIG.maxFiles, 1, MAX_CONFIGURED_FILES),
    maxFileBytes: boundedInteger(
      value.maxFileBytes,
      'maxFileBytes',
      DEFAULT_CONFIG.maxFileBytes,
      1,
      MAX_CONFIGURED_BYTES,
    ),
    maxTotalBytes: boundedInteger(
      value.maxTotalBytes,
      'maxTotalBytes',
      DEFAULT_CONFIG.maxTotalBytes,
      1,
      MAX_CONFIGURED_BYTES,
    ),
  };
}

export async function loadConfig(root: string, explicitPath?: string): Promise<DirChordConfig> {
  const configPath = explicitPath === undefined ? path.join(root, '.dirchord.json') : path.resolve(explicitPath);
  if (!(await exists(configPath))) {
    if (explicitPath !== undefined) {
      throw new DirChordError('CONFIG_NOT_FOUND', `Configuration file not found: ${explicitPath}`);
    }
    return { ...DEFAULT_CONFIG, ignores: [...DEFAULT_CONFIG.ignores] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(configPath, 'utf8')) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new DirChordError('INVALID_CONFIG', `Configuration is not valid JSON: ${configPath}`);
    }
    throw error;
  }
  return validateConfig(parsed);
}
