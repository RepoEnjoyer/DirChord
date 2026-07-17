import type {
  CollisionGroup,
  ComparisonResult,
  Difference,
  DuplicateGroup,
  InspectResult,
  Manifest,
  ManifestEntry,
} from './types.js';
import { comparePortableText } from './paths.js';

function entryIdentity(entry: ManifestEntry): string {
  return entry.type === 'file'
    ? `file:${entry.size}:${entry.sha256}`
    : `symlink:${entry.targetSha256}`;
}

function entriesEqual(left: ManifestEntry, right: ManifestEntry): boolean {
  return entryIdentity(left) === entryIdentity(right);
}

function differencePath(difference: Difference): string {
  return difference.kind === 'moved' ? `${difference.from}\0${difference.to}` : difference.path;
}

export function findCaseCollisions(manifest: Manifest): CollisionGroup[] {
  const groups = new Map<string, string[]>();
  for (const entry of manifest.entries) {
    const folded = entry.path.toLowerCase();
    const paths = groups.get(folded) ?? [];
    paths.push(entry.path);
    groups.set(folded, paths);
  }
  return [...groups.entries()]
    .filter(([, paths]) => new Set(paths).size > 1)
    .map(([foldedPath, paths]) => ({
      foldedPath,
      paths: [...paths].sort(comparePortableText),
    }))
    .sort((left, right) => comparePortableText(left.foldedPath, right.foldedPath));
}

export function findDuplicates(manifest: Manifest): DuplicateGroup[] {
  const groups = new Map<string, { sha256: string; size: number; paths: string[] }>();
  for (const entry of manifest.entries) {
    if (entry.type !== 'file') continue;
    const key = `${entry.size}:${entry.sha256}`;
    const group = groups.get(key) ?? { sha256: entry.sha256, size: entry.size, paths: [] };
    group.paths.push(entry.path);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((group) => group.paths.length > 1)
    .map((group) => ({ ...group, paths: group.paths.sort(comparePortableText) }))
    .sort((left, right) => right.size * right.paths.length - left.size * left.paths.length);
}

export function inspectManifest(manifest: Manifest): InspectResult {
  return {
    summary: { ...manifest.summary },
    duplicateGroups: findDuplicates(manifest),
    caseCollisions: findCaseCollisions(manifest),
  };
}

export function compareManifests(left: Manifest, right: Manifest): ComparisonResult {
  const leftByPath = new Map(left.entries.map((entry) => [entry.path, entry]));
  const rightByPath = new Map(right.entries.map((entry) => [entry.path, entry]));
  const removedCandidates: ManifestEntry[] = [];
  const addedCandidates: ManifestEntry[] = [];
  const differences: Difference[] = [];
  let unchanged = 0;

  for (const leftEntry of left.entries) {
    const rightEntry = rightByPath.get(leftEntry.path);
    if (rightEntry === undefined) {
      removedCandidates.push(leftEntry);
    } else if (entriesEqual(leftEntry, rightEntry)) {
      unchanged += 1;
    } else {
      differences.push({ kind: 'modified', path: leftEntry.path, before: leftEntry, after: rightEntry });
    }
  }
  for (const rightEntry of right.entries) {
    if (!leftByPath.has(rightEntry.path)) addedCandidates.push(rightEntry);
  }

  const addedByIdentity = new Map<string, ManifestEntry[]>();
  for (const entry of addedCandidates) {
    const identity = entryIdentity(entry);
    const group = addedByIdentity.get(identity) ?? [];
    group.push(entry);
    addedByIdentity.set(identity, group);
  }

  const movedAddedPaths = new Set<string>();
  const movedRemovedPaths = new Set<string>();
  for (const removed of removedCandidates) {
    const matches = addedByIdentity.get(entryIdentity(removed));
    const added = matches?.shift();
    if (added !== undefined) {
      movedRemovedPaths.add(removed.path);
      movedAddedPaths.add(added.path);
      differences.push({ kind: 'moved', from: removed.path, to: added.path, entry: added });
    }
  }

  for (const removed of removedCandidates) {
    if (!movedRemovedPaths.has(removed.path)) {
      differences.push({ kind: 'removed', path: removed.path, entry: removed });
    }
  }
  for (const added of addedCandidates) {
    if (!movedAddedPaths.has(added.path)) {
      differences.push({ kind: 'added', path: added.path, entry: added });
    }
  }

  const order = new Map([['modified', 0], ['moved', 1], ['removed', 2], ['added', 3]]);
  differences.sort((leftDifference, rightDifference) => {
    const kindOrder = (order.get(leftDifference.kind) ?? 99) - (order.get(rightDifference.kind) ?? 99);
    return kindOrder !== 0
      ? kindOrder
      : comparePortableText(differencePath(leftDifference), differencePath(rightDifference));
  });

  const summary = {
    unchanged,
    added: differences.filter((item) => item.kind === 'added').length,
    removed: differences.filter((item) => item.kind === 'removed').length,
    modified: differences.filter((item) => item.kind === 'modified').length,
    moved: differences.filter((item) => item.kind === 'moved').length,
  };

  return {
    equal: differences.length === 0,
    summary,
    differences,
    portability: {
      leftCaseCollisions: findCaseCollisions(left),
      rightCaseCollisions: findCaseCollisions(right),
    },
  };
}
