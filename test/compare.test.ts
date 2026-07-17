import { describe, expect, it } from 'vitest';
import { compareManifests, findCaseCollisions, findDuplicates, inspectManifest } from '../src/compare.js';
import type { FileEntry, Manifest } from '../src/types.js';

function file(path: string, contentKey: string, size = 1): FileEntry {
  return { type: 'file', path, size, sha256: contentKey.padEnd(64, '0') };
}

function manifest(entries: FileEntry[]): Manifest {
  return {
    format: 'dirchord/v1',
    createdBy: 'DirChord test',
    options: { algorithm: 'sha256', ignores: [], symlinks: 'hash-target-without-following' },
    summary: { files: entries.length, symlinks: 0, bytes: entries.reduce((sum, entry) => sum + entry.size, 0) },
    entries,
  };
}

describe('manifest comparison', () => {
  it('recognizes equal manifests', () => {
    const value = manifest([file('a.txt', 'a')]);
    const result = compareManifests(value, value);
    expect(result.equal).toBe(true);
    expect(result.summary.unchanged).toBe(1);
  });

  it('detects modified files', () => {
    const result = compareManifests(manifest([file('a.txt', 'a')]), manifest([file('a.txt', 'b')]));
    expect(result.differences).toMatchObject([{ kind: 'modified', path: 'a.txt' }]);
  });

  it('detects content moves', () => {
    const result = compareManifests(manifest([file('old.txt', 'a')]), manifest([file('new.txt', 'a')]));
    expect(result.summary).toMatchObject({ moved: 1, added: 0, removed: 0 });
    expect(result.differences).toMatchObject([{ kind: 'moved', from: 'old.txt', to: 'new.txt' }]);
  });

  it('detects additions and removals', () => {
    const result = compareManifests(manifest([file('removed', 'a')]), manifest([file('added', 'b')]));
    expect(result.summary).toMatchObject({ added: 1, removed: 1, moved: 0 });
  });

  it('pairs duplicate moves deterministically', () => {
    const left = manifest([file('a', 'x'), file('b', 'x')]);
    const right = manifest([file('c', 'x'), file('d', 'x')]);
    const result = compareManifests(left, right);
    expect(result.differences).toMatchObject([
      { kind: 'moved', from: 'a', to: 'c' },
      { kind: 'moved', from: 'b', to: 'd' },
    ]);
  });
});

describe('manifest inspection', () => {
  it('finds duplicate content', () => {
    const duplicates = findDuplicates(manifest([file('a', 'x', 10), file('b', 'x', 10), file('c', 'y', 4)]));
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.paths).toEqual(['a', 'b']);
  });

  it('finds case collisions', () => {
    const collisions = findCaseCollisions(manifest([file('Mods/A.jar', 'a'), file('mods/a.jar', 'b')]));
    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.paths).toEqual(['Mods/A.jar', 'mods/a.jar']);
  });

  it('combines inspection signals', () => {
    const result = inspectManifest(manifest([file('A', 'x'), file('a', 'x')]));
    expect(result.duplicateGroups).toHaveLength(1);
    expect(result.caseCollisions).toHaveLength(1);
  });
});
