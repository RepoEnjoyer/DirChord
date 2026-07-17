export const MANIFEST_FORMAT = 'dirchord/v1' as const;
export const HASH_ALGORITHM = 'sha256' as const;

export type EntryType = 'file' | 'symlink';

export interface FileEntry {
  type: 'file';
  path: string;
  size: number;
  sha256: string;
}

export interface SymlinkEntry {
  type: 'symlink';
  path: string;
  targetSha256: string;
}

export type ManifestEntry = FileEntry | SymlinkEntry;

export interface ManifestOptions {
  algorithm: typeof HASH_ALGORITHM;
  ignores: string[];
  symlinks: 'hash-target-without-following';
}

export interface ManifestSummary {
  files: number;
  symlinks: number;
  bytes: number;
}

export interface Manifest {
  format: typeof MANIFEST_FORMAT;
  createdBy: string;
  options: ManifestOptions;
  summary: ManifestSummary;
  entries: ManifestEntry[];
}

export type DifferenceKind = 'added' | 'removed' | 'modified' | 'moved';

export interface AddedDifference {
  kind: 'added';
  path: string;
  entry: ManifestEntry;
}

export interface RemovedDifference {
  kind: 'removed';
  path: string;
  entry: ManifestEntry;
}

export interface ModifiedDifference {
  kind: 'modified';
  path: string;
  before: ManifestEntry;
  after: ManifestEntry;
}

export interface MovedDifference {
  kind: 'moved';
  from: string;
  to: string;
  entry: ManifestEntry;
}

export type Difference =
  | AddedDifference
  | RemovedDifference
  | ModifiedDifference
  | MovedDifference;

export interface CollisionGroup {
  foldedPath: string;
  paths: string[];
}

export interface DuplicateGroup {
  sha256: string;
  size: number;
  paths: string[];
}

export interface ComparisonSummary {
  unchanged: number;
  added: number;
  removed: number;
  modified: number;
  moved: number;
}

export interface ComparisonResult {
  equal: boolean;
  summary: ComparisonSummary;
  differences: Difference[];
  portability: {
    leftCaseCollisions: CollisionGroup[];
    rightCaseCollisions: CollisionGroup[];
  };
}

export interface InspectResult {
  summary: ManifestSummary;
  duplicateGroups: DuplicateGroup[];
  caseCollisions: CollisionGroup[];
}

export interface DirChordConfig {
  ignores: string[];
  concurrency: number;
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

export interface SnapshotOptions extends DirChordConfig {
  extraIgnores?: string[];
}

export type ReportFormat = 'terminal' | 'json' | 'html';
