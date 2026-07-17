# Changelog

All notable changes to DirChord are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-07-17

### Added

- Deterministic SHA-256 manifests with no timestamps or absolute paths
- Folder-to-folder, manifest-to-manifest, and mixed comparisons
- Added, removed, modified, and content-based moved-file detection
- Duplicate-content and case-collision inspection
- Terminal, JSON, and self-contained accessible HTML reports
- Bounded concurrency, file-count, file-size, total-size, and manifest-size controls
- Symlink target hashing without traversal or target disclosure
- Atomic output, explicit overwrite protection, configuration validation, and stable exit codes
- Strict TypeScript API, automated tests, package validation, and multi-version CI
