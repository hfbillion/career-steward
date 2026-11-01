# Contributing to Career Steward

[English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING.zh-CN.md)

Thanks for helping improve Career Steward. Contributions should preserve its
local-first, evidence-grounded, and confirmation-gated design.

## Development setup

Requirements:

- Node.js 24 or newer;
- npm;
- Pi 1.4 or newer for interactive extension testing.

```bash
git clone https://github.com/hfbillion/career-steward.git
cd career-steward
npm install
npm run release:check
```

To load a development checkout into Pi:

```bash
pi install --local .
```

## Pull requests

Keep pull requests focused. Include:

- the user problem and intended behavior;
- tests for domain, persistence, or security boundary changes;
- documentation for user-visible behavior;
- an ADR under `docs/decisions/` when changing a durable architectural rule;
- confirmation that `npm run release:check` passes.

Do not commit real resumes, job applications, company-research snapshots,
SQLite databases, exported CVs, API keys, or other personal data. Use fictional
fixtures such as those under `test/`.

## Design constraints

- Pi orchestrates conversations; Career Steward owns validation and persisted
  state.
- Model output is a proposal, never evidence by itself.
- Destructive or state-activating operations require explicit confirmation.
- Historical revisions and opportunity events remain append-only.
- New document formats use parser or renderer adapters instead of weakening the
  existing contracts.
- Network features must preserve public-address validation and bounded reads.

## Coding and tests

- Keep TypeScript compatible with strict mode and `exactOptionalPropertyTypes`.
- Prefer deterministic application and domain tests over live model calls.
- Keep network-dependent checks out of the default test suite.
- Run targeted tests while developing, then run `npm run release:check` before
  opening a pull request.

By contributing, you agree that your contribution is licensed under the MIT
License included in this repository.
