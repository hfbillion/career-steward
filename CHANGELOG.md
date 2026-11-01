# Changelog

[English](CHANGELOG.md) | [简体中文](CHANGELOG.zh-CN.md)

All notable changes to Career Steward are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-01

### Added

- Text-based PDF resume parsing with stable evidence locations.
- Confirmation-gated Candidate Profile imports, amendments, and immutable
  revision history.
- JD capture, requirement analysis, deterministic capability matching, and
  explicit gap reporting.
- Source-tiered company research, bounded public-source acquisition, career
  preferences, and deterministic Employer Fit reports.
- Evidence-grounded tailored CV generation with Markdown and ATS-oriented DOCX
  export.
- Evidence-grounded Interview Plans with STAR stories, gap preparation,
  schedules, and reverse-interview questions.
- User-confirmed, event-sourced application tracking and the read-only
  `/career` dashboard.
- Local SQLite persistence, consistent backups, integrity validation, and
  confirmation-gated recovery with pre-restore safety snapshots.
- Four Pi Skills and 36 registered Career Steward tools.
- Automated unit, integration, security, persistence, and end-to-end acceptance
  coverage.

### Security

- Workspace path confinement for resume input, exports, backups, and restore.
- SSRF defenses, redirect validation, DNS pinning, deadlines, and size limits
  for public company-source acquisition.
- Evidence validation prevents unsupported CV and interview claims from being
  activated as candidate facts.

[1.0.0]: https://github.com/hfbillion/career-steward/releases/tag/v1.0.0
