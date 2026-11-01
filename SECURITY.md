# Security policy

[English](SECURITY.md) | [简体中文](SECURITY.zh-CN.md)

## Supported versions

Security fixes are provided for the latest `1.0.x` release. Users should update
to the newest patch before reporting an issue.

## Reporting a vulnerability

Do not disclose a vulnerability in a public issue. Use GitHub's private
security-reporting flow for the repository when available, or contact the
maintainer privately through the
[`hfbillion` GitHub profile](https://github.com/hfbillion).

Include the affected version, impact, reproduction steps, and any suggested
mitigation. Do not attach real resumes, SQLite databases, API keys, or other
personal data. A minimal fictional reproduction is preferred.

## Data and trust boundary

Career Steward is local-first, but its database and backup files contain
sensitive career information. They are not encrypted by the application.
Protect the workspace with operating-system access controls and store copied
backups in separately protected storage.

Company-source acquisition makes outbound HTTP(S) requests to user- or
agent-selected public URLs. It blocks non-public address ranges and applies
redirect, timeout, media-type, and response-size limits. These protections do
not establish that retrieved content is trustworthy.

Pi and the configured model provider may receive prompts or tool results during
normal use. Review the privacy and retention terms of the Pi installation and
model provider before processing personal information.
