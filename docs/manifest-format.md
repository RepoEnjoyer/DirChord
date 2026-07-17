# Manifest format

DirChord v1 manifests are UTF-8 JSON documents identified by `format: "dirchord/v1"`. The canonical filename suffix is `.dirchord.json`.

The formal schema is available at [`manifest.schema.json`](manifest.schema.json).

## Example

```json
{
  "format": "dirchord/v1",
  "createdBy": "DirChord 1.0.0",
  "options": {
    "algorithm": "sha256",
    "ignores": [".git/**"],
    "symlinks": "hash-target-without-following"
  },
  "summary": {
    "files": 1,
    "symlinks": 1,
    "bytes": 12
  },
  "entries": [
    {
      "type": "file",
      "path": "mods/example.jar",
      "size": 12,
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    },
    {
      "type": "symlink",
      "path": "current",
      "targetSha256": "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
    }
  ]
}
```

## Determinism rules

- No creation time or absolute root is stored.
- Paths are root-relative, separated with `/`, normalized to Unicode NFC, and sorted by deterministic code-unit order.
- Ignore patterns are normalized, deduplicated, and sorted.
- JSON uses two-space indentation and ends with a newline.
- Regular files use lowercase SHA-256 of their bytes.
- Symlinks use lowercase SHA-256 of the raw target string and are never followed.

The `createdBy` value is informational and is not used when deciding whether folder contents match.

## Validation

DirChord rejects malformed digests, absolute and parent-traversing paths, duplicate paths, impossible summary totals, unsupported algorithms or symlink modes, oversized JSON, too many entries, and values outside configured hard bounds.

Consumers should validate untrusted manifests before using paths or rendering reports. The supported library function is `validateManifest`.
