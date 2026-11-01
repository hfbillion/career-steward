# Career Steward · 职业管家

[English](README.md) | [简体中文](docs/zh-CN/README.md)

An evidence-grounded, local-first job-search agent built on Pi.

Career Steward 1.0 is an open-source Pi extension for managing candidate
evidence, analyzing opportunities, producing truthful ATS-oriented CVs,
preparing interviews, and tracking application progress. Pi handles
conversation and orchestration; Career Steward owns validation, revisioned
state, deterministic policies, and confirmation boundaries.

Career Steward turns candidate evidence into an explainable job-search workflow:

```text
resume evidence
  -> candidate profile
  -> JD and company analysis
  -> explainable match
  -> targeted CV
  -> interview plan
  -> user-confirmed opportunity timeline
```

## What 1.0 includes

The first stable release provides:

- a versioned document-parser contract;
- deterministic parsing for text-based PDF resumes;
- evidence-backed Candidate Profile drafts;
- explicit interactive confirmation and immutable profile revisions;
- evidence-grounded profile amendments and queryable revision history;
- evidence-backed JD capture and immutable job-analysis revisions;
- complete Requirement–Evidence Matrix validation;
- deterministic, versioned candidate-to-job matching;
- immutable Match Report revisions with input and policy provenance;
- source-tiered company research with explicit user confirmation;
- bounded public-web source acquisition with redirect validation, SSRF
  protection, normalized text, and response hashes;
- versioned employer preferences and deterministic Employer Fit reports;
- evidence-grounded, time-bounded interview preparation plans;
- evidence-grounded ATS-compatible Markdown CV drafts and revisions;
- local Markdown and single-column DOCX export from confirmed CV revisions;
- append-only, user-confirmed opportunity tracking and pipeline views;
- a read-only dynamic `/career` dashboard with pending reviews, recent activity,
  revision-aware next actions, and a structured `get_career_dashboard` tool;
- local SQLite persistence under `.career-steward/`;
- consistent local SQLite backup plus confirmation-gated restore with an
  automatic pre-restore safety snapshot;
- four Pi Skills for profile management, opportunity analysis, CV tailoring,
  and interview preparation.

Only text-based PDFs are accepted in the first version. Scanned PDFs, OCR, DOCX,
HTML, and image resumes are intentionally out of scope.

## Requirements

- Node.js 24 or newer
- Pi 1.4 or newer

## Quick start

```bash
git clone https://github.com/hfbillion/career-steward.git
cd career-steward
npm install
pi install --local .
```

Start Pi from the workspace where you want Career Steward to keep its local
data. Run `/career` to see the initial dashboard, then ask Pi to import a
text-based PDF resume located inside that trusted workspace.

Career Steward stores its system of record in
`.career-steward/career-steward.sqlite`. Do not commit that directory.

## Development

```bash
npm install
npm run check
npm test
npm run test:acceptance
npm run release:check
```

The acceptance command runs one complete fictional software-architect journey
from PDF evidence through DOCX export, interview preparation, pipeline events,
and the dynamic Dashboard. See
[`docs/acceptance-1.0.md`](docs/acceptance-1.0.md).

`npm run release:check` runs the strict TypeScript check, all tests, and the
production build used as the release gate.

To reload the development checkout in Pi:

```bash
pi install --local .
```

Then run `/career` or ask Pi to import a text-based PDF resume.

## Operating model

Career Steward deliberately separates proposal, confirmation, and persisted
state:

```text
user intent + retrieved evidence
  -> Pi proposes structured input
  -> Career Steward validates evidence and policy
  -> user reviews confirmation-gated changes
  -> SQLite stores immutable revisions or events
```

Model-written text is not treated as evidence. Match scores and Employer Fit
scores are calculated by versioned TypeScript policies rather than accepted
from a model. Application progress changes only after explicit user
confirmation.

`/career` is a live projection of confirmed profile state, pipeline counts,
pending confirmations, recent activity, and deterministic next actions. It is
read-only: a suggestion never confirms a draft or changes an opportunity state.
Agents and future interfaces can consume the same structured projection through
`get_career_dashboard`. See
[`docs/decisions/ADR-010-read-only-dynamic-career-dashboard.md`](docs/decisions/ADR-010-read-only-dynamic-career-dashboard.md).

The first end-to-end workflow is:

```text
import_resume
  -> propose_candidate_profile
  -> user review in a separate turn
  -> confirm_candidate_profile
  -> get_candidate_profile
```

Confirmed profile maintenance uses a separate confirmation-gated workflow:

```text
get_candidate_profile
  -> propose_candidate_profile_amendment
  -> review the complete field-level diff and evidence sources
  -> confirm_candidate_profile_amendment

list_candidate_profile_revisions
  -> get_candidate_profile_revision
```

Amendments may reuse confirmed evidence, cite another real block from the
original imported PDF, or preserve an explicit user statement as user evidence.
They never overwrite a historical revision. See
[`docs/decisions/ADR-008-evidence-grounded-profile-amendments.md`](docs/decisions/ADR-008-evidence-grounded-profile-amendments.md).

Resume paths must remain inside the current trusted workspace. Parsed evidence,
drafts, and confirmed revisions are stored in `.career-steward/career-steward.sqlite`.

Create a consistent backup with `create_career_data_backup`. By default, the
snapshot is written under the ignored `career-steward-backups/` directory. A
restore through `restore_career_data_backup` requires interactive confirmation,
checks integrity, checksum, and schema compatibility, and first preserves the
current database under `.career-steward/backups/`. Backups contain the complete
local profile and job-search history: they are neither redacted nor encrypted.
See
[`docs/decisions/ADR-012-confirmation-gated-local-data-recovery.md`](docs/decisions/ADR-012-confirmation-gated-local-data-recovery.md).

The confirmed job-analysis workflow is:

```text
create_job_opportunity
  -> propose_job_analysis
  -> user review in a separate turn
  -> confirm_job_analysis
  -> get_job_opportunity
```

The matching workflow continues from confirmed revisions:

```text
get_candidate_profile + get_job_opportunity
  -> calculate_job_match
  -> get_job_match
```

`calculate_job_match` accepts semantic assessments and stable candidate evidence
ids, but it does not accept weights or a final score. Career Steward validates a
complete one-to-one Requirement–Evidence Matrix and applies the versioned
`matching-policy/1.0` policy in TypeScript.

Company and employer-fit workflows are:

```text
web/search evidence
  -> propose_company_research
  -> user review in a separate turn
  -> confirm_company_research
  -> get_company_research

user preference interview
  -> propose_career_preferences
  -> user review in a separate turn
  -> confirm_career_preferences
  -> get_career_preferences

confirmed company research + confirmed preferences
  -> calculate_employer_fit
  -> get_employer_fit
```

Career Steward stores official facts, professional reporting, community
sentiment, award records, and model inferences as distinguishable claim types.
It validates source structure but does not treat a syntactically valid URL as
proof of truth. Employer Fit remains separate from the capability match score.

## Architecture

Pi is the conversational runtime and orchestration host. Career Steward owns the
domain rules, evidence model, validation, persistence boundaries, and artifacts.
See [`docs/architecture.md`](docs/architecture.md).
The matching decision is recorded in
[`docs/decisions/ADR-003-deterministic-matching.md`](docs/decisions/ADR-003-deterministic-matching.md).
Company evidence and Employer Fit are defined in
[`docs/decisions/ADR-004-company-intelligence-and-employer-fit.md`](docs/decisions/ADR-004-company-intelligence-and-employer-fit.md).

The tailored CV workflow is:

```text
confirmed profile + confirmed job analysis + current Match Report
  -> propose_tailored_resume
  -> review Markdown, coverage, ATS checks, and warnings in a separate turn
  -> confirm_tailored_resume
  -> get_tailored_resume
  -> export_tailored_resume (markdown or docx)
```

Version 1.0 keeps canonical Markdown and can export a confirmed revision as a
Markdown file or an ATS-oriented single-column DOCX. Export never changes
confirmed wording and never overwrites an existing file. PDF remains deferred,
and ATS compatibility checks are not represented as guaranteed vendor
acceptance. See
[`docs/decisions/ADR-005-evidence-grounded-ats-cv.md`](docs/decisions/ADR-005-evidence-grounded-ats-cv.md)
and
[`docs/decisions/ADR-009-ats-resume-export-renderers.md`](docs/decisions/ADR-009-ats-resume-export-renderers.md).

The interview preparation workflow is:

```text
get_candidate_profile + get_job_opportunity + get_job_match
  + optional get_company_research
  -> create_interview_plan
  -> get_interview_plan
```

Plans cover every confirmed requirement, validate STAR evidence against a single
experience, and include a time-bounded schedule and reverse-interview questions.
They report risks and preparation effort, not a fabricated pass probability.
See
[`docs/decisions/ADR-006-evidence-grounded-interview-plan.md`](docs/decisions/ADR-006-evidence-grounded-interview-plan.md).

The opportunity-tracking workflow is user-triggered:

```text
explicit user progress statement
  -> record_opportunity_event
  -> interactive confirmation
  -> get_opportunity_timeline

all stored opportunities
  -> list_opportunity_pipeline
  -> optional pipeline-status filter
```

`JobOpportunity.status` continues to mean JD analysis state (`captured` or
`analyzed`). Application progress is a separate `pipelineStatus` derived from
immutable events. Pi may structure a user's statement, but it cannot silently
mark an opportunity as applied, interviewing, offered, rejected, or accepted.
See
[`docs/decisions/ADR-007-event-sourced-opportunity-tracking.md`](docs/decisions/ADR-007-event-sourced-opportunity-tracking.md).

## Data, privacy, and security

Career Steward is local-first: its application state, generated artifacts, and
backups remain under the trusted workspace unless the user copies them
elsewhere. Local database and backup files contain sensitive career data and
are not encrypted by Career Steward. Use operating-system access controls and
protected backup storage.

Pi and the configured model provider may still receive prompts and tool results
during normal use. Review their privacy and retention terms before processing
personal information. Public company-source fetching is bounded and protected
against private-network access, but a successfully retrieved page is not proof
that its claims are accurate.

Do not commit real resumes, exported CVs, `.career-steward/`, backup snapshots,
or API credentials. See [SECURITY.md](SECURITY.md) for vulnerability reporting
and the full trust boundary.

## Project documentation

- [Architecture](docs/architecture.md)
- [1.0 acceptance](docs/acceptance-1.0.md)
- [Architecture decisions](docs/decisions/)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

## Contributing

Issues and focused pull requests are welcome. Run `npm run release:check`, use
fictional test fixtures, and document durable architectural changes with an
ADR. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Career Steward is available under the [MIT License](LICENSE).
