import { createHash } from 'node:crypto';
import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import { createManifest, loadManifest, manifestToJson, validateManifest } from '../src/manifest.js';
import type { Manifest } from '../src/types.js';

const temporaryPaths: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dirchord-test-'));
  temporaryPaths.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((item) => rm(item, { recursive: true, force: true })));
});

function emptyManifest(): Manifest {
  return {
    format: 'dirchord/v1',
    createdBy: 'DirChord test',
    options: { algorithm: 'sha256', ignores: [], symlinks: 'hash-target-without-following' },
    summary: { files: 0, symlinks: 0, bytes: 0 },
    entries: [],
  };
}

describe('manifest creation', () => {
  it('creates a deterministic manifest', async () => {
    const directory = await temporaryDirectory();
    await writeFile(path.join(directory, 'hello.txt'), 'hello\n');
    const first = await createManifest(directory);
    const second = await createManifest(directory);
    expect(manifestToJson(first)).toBe(manifestToJson(second));
    expect(first.summary).toEqual({ files: 1, symlinks: 0, bytes: 6 });
  });

  it('uses the expected SHA-256 content digest', async () => {
    const directory = await temporaryDirectory();
    await writeFile(path.join(directory, 'asset.bin'), 'content');
    const manifest = await createManifest(directory);
    const entry = manifest.entries[0];
    expect(entry?.type).toBe('file');
    if (entry?.type === 'file') {
      expect(entry.sha256).toBe(createHash('sha256').update('content').digest('hex'));
    }
  });

  it('respects ignore patterns', async () => {
    const directory = await temporaryDirectory();
    await writeFile(path.join(directory, 'keep.txt'), 'keep');
    await writeFile(path.join(directory, 'skip.log'), 'skip');
    const manifest = await createManifest(directory, { ignores: ['*.log'] });
    expect(manifest.entries.map((entry) => entry.path)).toEqual(['keep.txt']);
  });

  it('hashes symlink targets without following them', async () => {
    const directory = await temporaryDirectory();
    const external = path.join(await temporaryDirectory(), 'outside.txt');
    await writeFile(external, 'outside content that must not be read');
    await symlink(external, path.join(directory, 'link'));
    const manifest = await createManifest(directory);
    expect(manifest.summary).toEqual({ files: 0, symlinks: 1, bytes: 0 });
    expect(manifest.entries[0]).toMatchObject({ type: 'symlink', path: 'link' });
    expect(JSON.stringify(manifest)).not.toContain('outside content');
    expect(JSON.stringify(manifest)).not.toContain(external);
  });

  it('enforces file-count limits', async () => {
    const directory = await temporaryDirectory();
    await writeFile(path.join(directory, 'one'), '1');
    await writeFile(path.join(directory, 'two'), '2');
    await expect(createManifest(directory, { maxFiles: 1 })).rejects.toThrow(/maxFiles/u);
  });

  it('enforces total-byte limits', async () => {
    const directory = await temporaryDirectory();
    await writeFile(path.join(directory, 'large'), '12345');
    await expect(createManifest(directory, { maxTotalBytes: 4 })).rejects.toThrow(/maxTotalBytes/u);
  });

  it('rejects unsafe API concurrency', async () => {
    const directory = await temporaryDirectory();
    await expect(createManifest(directory, { concurrency: 0 })).rejects.toThrow(/concurrency/u);
  });
});

describe('manifest validation', () => {
  it('round-trips a manifest from disk', async () => {
    const directory = await temporaryDirectory();
    const manifestPath = path.join(directory, 'sample.dirchord.json');
    await writeFile(manifestPath, manifestToJson(emptyManifest()));
    expect(await loadManifest(manifestPath)).toEqual(emptyManifest());
    expect((await readFile(manifestPath, 'utf8')).endsWith('\n')).toBe(true);
  });

  it('rejects traversal paths', () => {
    const manifest = emptyManifest();
    manifest.entries = [{ type: 'file', path: '../escape', size: 0, sha256: 'a'.repeat(64) }];
    manifest.summary.files = 1;
    expect(() => validateManifest(manifest)).toThrow(/relative|parent/u);
  });

  it('rejects duplicate paths', () => {
    const manifest = emptyManifest();
    manifest.entries = [
      { type: 'file', path: 'same', size: 0, sha256: 'a'.repeat(64) },
      { type: 'file', path: 'same', size: 0, sha256: 'b'.repeat(64) },
    ];
    manifest.summary.files = 2;
    expect(() => validateManifest(manifest)).toThrow(/Duplicate/u);
  });

  it('rejects an incorrect summary', () => {
    const manifest = emptyManifest();
    manifest.summary.files = 1;
    expect(() => validateManifest(manifest)).toThrow(/summary/u);
  });

  it('rejects malformed hashes', () => {
    const manifest = emptyManifest();
    manifest.entries = [{ type: 'file', path: 'file', size: 0, sha256: 'not-a-hash' }];
    manifest.summary.files = 1;
    expect(() => validateManifest(manifest)).toThrow(/SHA-256/u);
  });

  it('rejects unexpected fields', () => {
    const manifest = { ...emptyManifest(), absoluteRoot: '/private/path' };
    expect(() => validateManifest(manifest)).toThrow(/Unexpected manifest field/u);
  });
});
