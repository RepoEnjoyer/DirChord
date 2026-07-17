# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| Latest `1.x` release | Yes |
| Older releases | Best effort |

## Reporting a vulnerability

Use the repository's **Security** tab and GitHub's private vulnerability reporting flow when available. Do not place an exploit, sensitive manifest, private filename list, or affected personal data in a public issue.

Include the affected version, operating system, impact, reproduction steps using synthetic data, and any suggested mitigation. A maintainer will acknowledge a complete report as soon as practical and coordinate disclosure after a fix is available.

Ordinary bugs that do not expose data or cross a trust boundary may use the public bug report template.

## Security boundaries

DirChord hashes local files requested by the user and reads untrusted manifest JSON. It does not classify files as safe, detect malware, encrypt data, or prove that a folder was created by a trusted person. Review [the security model](docs/security-model.md) before relying on a manifest in a high-risk workflow.
