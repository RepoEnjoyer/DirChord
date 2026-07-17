# Configuration

DirChord reads `.dirchord.json` from the root of each scanned folder. Pass `--config <file>` to use an explicit file instead. Unknown keys and invalid values are rejected rather than silently ignored.

Create a starting file with:

```bash
dirchord init ./MyPack
```

## Complete example

```json
{
  "ignores": [
    ".git/**",
    ".DS_Store",
    "Thumbs.db",
    "*.log",
    "cache/**"
  ],
  "concurrency": 8,
  "maxFiles": 250000,
  "maxFileBytes": 8589934592,
  "maxTotalBytes": 107374182400
}
```

## Options

| Key | Default | Allowed | Meaning |
| --- | ---: | ---: | --- |
| `ignores` | `.git/**`, `.DS_Store`, `Thumbs.db` | Up to 2,000 strings | Ordered path patterns excluded from the snapshot |
| `concurrency` | `8` | `1` to `64` | Maximum files hashed at once |
| `maxFiles` | `250000` | `1` to `2000000` | Maximum regular files and symlinks |
| `maxFileBytes` | `8589934592` | `1` to `1099511627776` | Maximum bytes in one file |
| `maxTotalBytes` | `107374182400` | `1` to `1099511627776` | Maximum bytes across regular files |

Limits are safety controls. Raising them can increase runtime, I/O load, memory use, and report size. Increase only the limit that blocks a reviewed folder.

## Ignore pattern syntax

- `*` matches zero or more characters inside one path segment.
- `**` matches across directories.
- `?` matches one non-separator character.
- A pattern without `/` matches a basename at any depth.
- A leading `!` reverses an earlier matching pattern.
- `#` starts a comment when it is the first non-whitespace character.
- Backslashes are normalized to forward slashes.

Patterns are applied in order. For efficient traversal, an ignored directory is not opened. A later negation therefore cannot re-include a child of a directory that was already excluded; keep the parent included and ignore narrower paths instead.

Command-line `--ignore` patterns are appended after configuration patterns. The output report or manifest is automatically excluded when it sits inside a scanned root, preventing self-referential snapshots.
