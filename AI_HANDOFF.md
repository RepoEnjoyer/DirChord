# AI handoff

## Product intent

DirChord is a local-first folder manifest and comparison tool. The primary users are game modpack maintainers, creators sharing asset bundles, people validating backups, and small teams that need to answer whether two directory trees contain the same bytes.

The product must stay clearly separate from LeakFence. LeakFence scans repositories for secrets, PII, Git identity, risky metadata, and publication leaks. DirChord does not inspect or classify file contents. It computes hashes and compares directory state.

## Architecture

- `src/cli.ts`: dependency-free argument parser, commands, safe labels, output selection, and exit codes.
- `src/manifest.ts`: bounded traversal, race-aware file hashing, symlink handling, deterministic serialization, and hostile-manifest validation.
- `src/compare.ts`: content identity, moved-file pairing, duplicate grouping, and case-collision analysis.
- `src/config.ts` and `src/glob.ts`: strict config validation and the documented glob subset.
- `src/report.ts`: terminal, JSON, and script-free HTML renderers. Treat paths and labels as untrusted.
- `src/io.ts`: same-directory temporary writes and overwrite protection.
- `src/index.ts`: supported library surface.
- `test/`: unit and integration-oriented filesystem tests.

## Important decisions

1. Manifests omit timestamps and root names so identical inputs serialize identically.
2. SHA-256 is the only algorithm in v1. Changing algorithms requires a new manifest format or an explicit compatibility design.
3. Paths are relative, forward-slashed, NFC-normalized, and sorted with code-unit ordering rather than locale-sensitive ordering.
4. Symlinks are not followed. Only a hash of the raw target string is stored, preventing target-path disclosure while preserving comparability.
5. File handles use `O_NOFOLLOW` and pre/post metadata checks to reduce link-swap and concurrent-write risk. Directory traversal still assumes the scanned tree is not being maliciously rewritten during a scan.
6. Reports never embed file contents. Terminal control characters are rendered visibly and HTML is escaped.
7. There are no runtime dependencies or application network calls.
8. Exit code `1` means a valid comparison found differences; exit code `2` means an error.

## Current limitations

- Hashing is whole-file, so a small change in a very large archive requires re-reading the entire file.
- Rename detection pairs identical hashes deterministically; duplicate identical files can make the human meaning of a particular move ambiguous.
- Ignore syntax intentionally implements a useful subset of gitignore behavior. Re-including a child of an excluded directory is not supported.
- Unicode case-collision detection uses JavaScript lowercase mapping and cannot perfectly model every filesystem.
- A manifest exposes relative paths, sizes, and hashes. It is not an anonymity tool.
- The CLI has no progress bar or incremental cache in v1.

## Validation

Run:

```bash
npm run check
```

This performs ESLint, strict source and test type checks, Vitest, a clean TypeScript build, and `npm pack --dry-run`. Also run a manual snapshot/compare/verify cycle before release. CI covers supported Node.js versions.

## Sensible next steps

1. Add signed manifests with carefully separated signing and verification commands.
2. Design an incremental cache keyed by stable file metadata while preserving a no-cache verification mode.
3. Add cross-platform CLI end-to-end tests that spawn the built binary and assert exit codes.

Avoid adding a hosted backend, telemetry, secret scanning, or PII detection. Those either violate DirChord's trust model or duplicate another project.
