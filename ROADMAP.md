# Roadmap

DirChord 1.0 focuses on trustworthy snapshots and comparisons. Future work should preserve deterministic output, local-only operation, and zero runtime dependencies unless a clear benefit justifies changing one of those constraints.

## Near term

- Add an optional `--watch` mode that incrementally refreshes a local manifest after filesystem changes.
- Add signed manifests using user-supplied Ed25519 keys without introducing an account or hosted service.
- Add a compact binary manifest option for folders with hundreds of thousands of files.

## Later

- Build a desktop drag-and-drop interface on top of the existing library API.
- Add chunked hashing for large files so partially changed archives can be diagnosed more precisely.
- Publish official packages to npm and selected system package managers once release automation and provenance signing are established.

Roadmap items are intentions, not promises. Proposals with concrete use cases are welcome.
