# Contributing to DirChord

Thanks for helping make folder comparisons more dependable.

## Before opening a change

- Search existing issues and discussions.
- Keep core operation local. New network behavior requires an explicit design discussion and must be opt-in.
- Do not add telemetry, accounts, paid-service requirements, or raw file contents to manifests and reports.
- Preserve deterministic manifest output across operating systems.
- Avoid runtime dependencies unless the maintenance and security tradeoff is clearly justified.

## Development workflow

1. Fork the repository and create a focused branch.
2. Install Node.js 20.19 or newer and run `npm ci`.
3. Add or update tests with the implementation.
4. Run `npm run check`.
5. Open a pull request using the repository template.

## Testing filesystem behavior

Use temporary directories in tests. Tests must not depend on a developer's home directory, username, installed games, or private data. When testing path behavior, include Windows and POSIX considerations even if the change is developed on one platform.

## Commit and pull request scope

Keep changes reviewable. Explain user impact, security implications, and validation. Generated `dist/`, dependency directories, local reports, and real manifests do not belong in commits.

By contributing, you agree that your contribution is licensed under the MIT License.
