import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, opendir, readFile, readlink, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_CONFIG,
  MAX_CONFIGURED_BYTES,
  MAX_CONFIGURED_FILES,
  MAX_IGNORE_PATTERNS,
  MAX_MANIFEST_BYTES,
} from './constants.js';
import { validateConfig } from './config.js';
import { DirChordError } from './errors.js';
import { compilePatterns, isIgnored, normalizePattern } from './glob.js';
import { assertSafeManifestPath, comparePortableText, relativePortablePath } from './paths.js';
import {
  HASH_ALGORITHM,
  MANIFEST_FORMAT,
  type FileEntry,
  type Manifest,
  type ManifestEntry,
  type SnapshotOptions,
} from './types.js';
import { VERSION } from './constants.js';

interface FileCandidate {
  path: string;
  absolutePath: string;
  size: number;
  mtimeNs: bigint;
  ctimeNs: bigint;
  dev: bigint;
  ino: bigint;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertAllowedKeys(value: UnknownRecord, allowed: readonly string[], context: string): void {
  const allowedSet = new Set(allowed);
  const extras = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (extras.length > 0) {
    throw new DirChordError('INVALID_MANIFEST', `Unexpected ${context} field(s): ${extras.join(', ')}.`);
  }
}

function assertSafeInteger(value: unknown, field: string, maximum = Number.MAX_SAFE_INTEGER): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) {
    throw new DirChordError('INVALID_MANIFEST', `${field} must be a non-negative safe integer.`);
  }
}

function assertSha256(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new DirChordError('INVALID_MANIFEST', `${field} must be a lowercase SHA-256 digest.`);
  }
}

function hashText(value: string): string {
  return createHash(HASH_ALGORITHM).update(value, 'utf8').digest('hex');
}

async function hashFile(candidate: FileCandidate): Promise<FileEntry> {
  const hash = createHash(HASH_ALGORITHM);
  let handle;
  try {
    handle = await open(candidate.absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.size !== BigInt(candidate.size) ||
      before.mtimeNs !== candidate.mtimeNs ||
      before.ctimeNs !== candidate.ctimeNs ||
      before.dev !== candidate.dev ||
      before.ino !== candidate.ino
    ) {
      throw new DirChordError('FILE_CHANGED', `${candidate.path} changed before it could be hashed.`);
    }
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      hash.update(chunk as Buffer);
    }
    const after = await handle.stat({ bigint: true });
    if (
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs ||
      after.dev !== before.dev ||
      after.ino !== before.ino
    ) {
      throw new DirChordError(
        'FILE_CHANGED',
        `${candidate.path} changed while it was being hashed. Stop writes to the folder and try again.`,
      );
    }
  } catch (error) {
    if (error instanceof DirChordError) throw error;
    throw new DirChordError('FILE_READ_FAILED', `Could not read ${candidate.path}.`, { cause: error });
  } finally {
    await handle?.close().catch(() => undefined);
  }

  return {
    type: 'file',
    path: candidate.path,
    size: candidate.size,
    sha256: hash.digest('hex'),
  };
}

async function mapConcurrent<T, R>(
  values: T[],
  limit: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) results[index] = await operation(value);
    }
  }

  const workers = Array.from({ length: Math.min(limit, Math.max(1, values.length)) }, worker);
  await Promise.all(workers);
  return results;
}

function mergedOptions(options?: Partial<SnapshotOptions>): SnapshotOptions {
  const extraIgnores = options?.extraIgnores;
  const validated = validateConfig({
    ignores: options?.ignores ?? DEFAULT_CONFIG.ignores,
    concurrency: options?.concurrency ?? DEFAULT_CONFIG.concurrency,
    maxFiles: options?.maxFiles ?? DEFAULT_CONFIG.maxFiles,
    maxFileBytes: options?.maxFileBytes ?? DEFAULT_CONFIG.maxFileBytes,
    maxTotalBytes: options?.maxTotalBytes ?? DEFAULT_CONFIG.maxTotalBytes,
  });
  return {
    ...validated,
    ignores: [...validated.ignores],
    ...(extraIgnores === undefined ? {} : { extraIgnores: [...extraIgnores] }),
  };
}

export async function createManifest(rootInput: string, partialOptions?: Partial<SnapshotOptions>): Promise<Manifest> {
  const root = path.resolve(rootInput);
  let rootStats;
  try {
    rootStats = await lstat(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new DirChordError('ROOT_NOT_FOUND', `Folder not found: ${rootInput}`);
    }
    throw error;
  }
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new DirChordError('ROOT_NOT_DIRECTORY', `Snapshot input must be a real directory: ${rootInput}`);
  }

  const options = mergedOptions(partialOptions);
  const ignores = [...options.ignores, ...(options.extraIgnores ?? [])].map(normalizePattern);
  if (ignores.length > MAX_IGNORE_PATTERNS) {
    throw new DirChordError('TOO_MANY_IGNORES', `No more than ${MAX_IGNORE_PATTERNS.toLocaleString()} ignore patterns are allowed.`);
  }
  const patterns = compilePatterns(ignores);
  const files: FileCandidate[] = [];
  const symlinks: ManifestEntry[] = [];
  const seenPortablePaths = new Set<string>();
  let totalBytes = 0;

  async function walk(directory: string): Promise<void> {
    const handle = await opendir(directory);
    const children = [];
    for await (const child of handle) children.push(child);
    children.sort((left, right) => comparePortableText(left.name, right.name));

    for (const child of children) {
      const absolutePath = path.join(directory, child.name);
      const manifestPath = relativePortablePath(root, absolutePath);
      if (isIgnored(manifestPath, patterns) || (child.isDirectory() && isIgnored(`${manifestPath}/`, patterns))) {
        continue;
      }

      if (seenPortablePaths.has(manifestPath)) {
        throw new DirChordError(
          'PATH_NORMALIZATION_COLLISION',
          `Two filesystem entries normalize to the same portable path: ${manifestPath}`,
        );
      }
      seenPortablePaths.add(manifestPath);

      if (files.length + symlinks.length >= options.maxFiles) {
        throw new DirChordError(
          'FILE_LIMIT',
          `The snapshot exceeded maxFiles (${options.maxFiles.toLocaleString()}). Raise the configured limit intentionally.`,
        );
      }

      const entryStats = await lstat(absolutePath, { bigint: true });

      if (entryStats.isSymbolicLink()) {
        const target = await readlink(absolutePath);
        symlinks.push({ type: 'symlink', path: manifestPath, targetSha256: hashText(target) });
        continue;
      }

      if (entryStats.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (!entryStats.isFile()) continue;
      const size = Number(entryStats.size);
      if (!Number.isSafeInteger(size)) {
        throw new DirChordError('FILE_TOO_LARGE', `${manifestPath} is too large to represent safely.`);
      }
      if (size > options.maxFileBytes) {
        throw new DirChordError(
          'FILE_TOO_LARGE',
          `${manifestPath} exceeds maxFileBytes (${options.maxFileBytes.toLocaleString()}).`,
        );
      }
      totalBytes += size;
      if (totalBytes > options.maxTotalBytes) {
        throw new DirChordError(
          'TOTAL_SIZE_LIMIT',
          `The snapshot exceeded maxTotalBytes (${options.maxTotalBytes.toLocaleString()}).`,
        );
      }
      files.push({
        path: manifestPath,
        absolutePath,
        size,
        mtimeNs: entryStats.mtimeNs,
        ctimeNs: entryStats.ctimeNs,
        dev: entryStats.dev,
        ino: entryStats.ino,
      });
    }
  }

  await walk(root);
  const hashedFiles = await mapConcurrent(files, options.concurrency, hashFile);
  const entries = [...hashedFiles, ...symlinks].sort((left, right) => comparePortableText(left.path, right.path));

  return {
    format: MANIFEST_FORMAT,
    createdBy: `DirChord ${VERSION}`,
    options: {
      algorithm: HASH_ALGORITHM,
      ignores: [...new Set(ignores)].sort(comparePortableText),
      symlinks: 'hash-target-without-following',
    },
    summary: {
      files: hashedFiles.length,
      symlinks: symlinks.length,
      bytes: totalBytes,
    },
    entries,
  };
}

export function validateManifest(value: unknown): Manifest {
  if (!isRecord(value) || value.format !== MANIFEST_FORMAT) {
    throw new DirChordError('INVALID_MANIFEST', `Manifest format must be ${MANIFEST_FORMAT}.`);
  }
  assertAllowedKeys(value, ['format', 'createdBy', 'options', 'summary', 'entries'], 'manifest');
  if (typeof value.createdBy !== 'string' || value.createdBy.length === 0 || value.createdBy.length > 200) {
    throw new DirChordError('INVALID_MANIFEST', 'createdBy must be a short, non-empty string.');
  }
  if (!isRecord(value.options) || value.options.algorithm !== HASH_ALGORITHM) {
    throw new DirChordError('INVALID_MANIFEST', `Manifest algorithm must be ${HASH_ALGORITHM}.`);
  }
  assertAllowedKeys(value.options, ['algorithm', 'ignores', 'symlinks'], 'options');
  if (value.options.symlinks !== 'hash-target-without-following') {
    throw new DirChordError('INVALID_MANIFEST', 'Manifest symlink mode is unsupported.');
  }
  if (
    !Array.isArray(value.options.ignores) ||
    value.options.ignores.some((item) => typeof item !== 'string') ||
    value.options.ignores.length > MAX_IGNORE_PATTERNS
  ) {
    throw new DirChordError('INVALID_MANIFEST', 'Manifest ignores must be a bounded string array.');
  }
  if (!Array.isArray(value.entries) || value.entries.length > MAX_CONFIGURED_FILES) {
    throw new DirChordError('INVALID_MANIFEST', 'Manifest entries must be a bounded array.');
  }

  const entries: ManifestEntry[] = [];
  const seenPaths = new Set<string>();
  let files = 0;
  let symlinks = 0;
  let bytes = 0;

  for (const rawEntry of value.entries) {
    if (!isRecord(rawEntry)) throw new DirChordError('INVALID_MANIFEST', 'Every entry must be an object.');
    assertSafeManifestPath(rawEntry.path);
    if (seenPaths.has(rawEntry.path)) {
      throw new DirChordError('INVALID_MANIFEST', `Duplicate manifest path: ${rawEntry.path}`);
    }
    seenPaths.add(rawEntry.path);

    if (rawEntry.type === 'file') {
      assertAllowedKeys(rawEntry, ['type', 'path', 'size', 'sha256'], `file entry ${rawEntry.path}`);
      assertSafeInteger(rawEntry.size, `size for ${rawEntry.path}`, MAX_CONFIGURED_BYTES);
      assertSha256(rawEntry.sha256, `sha256 for ${rawEntry.path}`);
      files += 1;
      bytes += rawEntry.size;
      if (!Number.isSafeInteger(bytes) || bytes > MAX_CONFIGURED_BYTES) {
        throw new DirChordError('INVALID_MANIFEST', 'Manifest byte total exceeds the safety limit.');
      }
      entries.push({ type: 'file', path: rawEntry.path, size: rawEntry.size, sha256: rawEntry.sha256 });
    } else if (rawEntry.type === 'symlink') {
      assertAllowedKeys(rawEntry, ['type', 'path', 'targetSha256'], `symlink entry ${rawEntry.path}`);
      assertSha256(rawEntry.targetSha256, `targetSha256 for ${rawEntry.path}`);
      symlinks += 1;
      entries.push({ type: 'symlink', path: rawEntry.path, targetSha256: rawEntry.targetSha256 });
    } else {
      throw new DirChordError('INVALID_MANIFEST', `Unsupported entry type at ${rawEntry.path}.`);
    }
  }

  if (!isRecord(value.summary)) throw new DirChordError('INVALID_MANIFEST', 'Manifest summary is missing.');
  assertAllowedKeys(value.summary, ['files', 'symlinks', 'bytes'], 'summary');
  assertSafeInteger(value.summary.files, 'summary.files');
  assertSafeInteger(value.summary.symlinks, 'summary.symlinks');
  assertSafeInteger(value.summary.bytes, 'summary.bytes');
  if (value.summary.files !== files || value.summary.symlinks !== symlinks || value.summary.bytes !== bytes) {
    throw new DirChordError('INVALID_MANIFEST', 'Manifest summary does not match its entries.');
  }

  return {
    format: MANIFEST_FORMAT,
    createdBy: value.createdBy,
    options: {
      algorithm: HASH_ALGORITHM,
      ignores: (value.options.ignores as string[]).map(normalizePattern),
      symlinks: 'hash-target-without-following',
    },
    summary: { files, symlinks, bytes },
    entries: entries.sort((left, right) => comparePortableText(left.path, right.path)),
  };
}

export async function loadManifest(filePath: string): Promise<Manifest> {
  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new DirChordError('MANIFEST_NOT_FOUND', `Manifest not found: ${filePath}`);
    }
    throw error;
  }
  if (!fileStats.isFile()) throw new DirChordError('INVALID_MANIFEST', `Manifest is not a regular file: ${filePath}`);
  if (fileStats.size > MAX_MANIFEST_BYTES) {
    throw new DirChordError(
      'MANIFEST_TOO_LARGE',
      `Manifest exceeds the ${Math.floor(MAX_MANIFEST_BYTES / 1024 / 1024)} MiB safety limit.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new DirChordError('INVALID_MANIFEST', `Manifest is not valid JSON: ${filePath}`);
    }
    throw error;
  }
  return validateManifest(parsed);
}

export function manifestToJson(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
