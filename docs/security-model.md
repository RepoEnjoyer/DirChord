# Security and privacy model

## Goals

DirChord aims to compare folder state without uploading files, embedding their contents in reports, following symlinks, or exposing absolute local paths. It treats manifest JSON and every filename inside it as untrusted input.

## Protections

- Application code contains no network client, telemetry, analytics, update checker, or account system.
- Regular files are opened with no-follow semantics where supported.
- File identity and metadata are checked before and after hashing to detect ordinary concurrent replacement or modification.
- Symlinks are not followed. Their raw targets are one-way hashed before entering a manifest.
- Manifest reads are limited to 64 MiB and validated for entry counts, paths, hashes, totals, and supported modes.
- HTML reports contain no JavaScript and escape labels and paths.
- Terminal reports show control characters as visible Unicode escape sequences.
- Output uses a same-directory temporary file and an atomic rename. Existing outputs require `--force`.
- The default application has zero runtime dependencies, reducing supply-chain surface.

## Information present in a manifest

Manifests contain relative paths, directory structure implied by those paths, file byte sizes, file SHA-256 hashes, hashed symlink targets, ignore settings, and summary counts. They contain no file bytes, absolute root, timestamp, username, or host identifier.

A hash is not encryption. A person who already has a suspected file can hash it and test whether it appears in the manifest. Filenames can also be sensitive. Review a manifest before sharing it outside its intended group.

## Non-goals

DirChord does not:

- scan for malware, secrets, personal information, or unsafe code;
- prove who created a folder or manifest;
- make untrusted files safe to open;
- prevent a privileged local attacker from changing the filesystem;
- encrypt, compress, upload, download, or synchronize files;
- replace a signed release, reproducible build system, or backup strategy.

## Concurrent mutation

DirChord detects common file changes during hashing, but a directory tree that is being maliciously rewritten during traversal is outside the v1 threat model. Scan a stable folder you control. For high-assurance distribution, combine a stable snapshot with signed manifests after that feature is available.
