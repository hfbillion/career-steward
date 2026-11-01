# Career Steward 1.0 Architecture

[English](architecture.md) | [简体中文](zh-CN/architecture.md)

## Positioning

Pi is the intelligent interaction entry point, task orchestrator, and extension
runtime. It is not the system of record. Career Steward's domain core remains
independent from Pi so that candidate evidence, matching rules, and artifacts do
not depend on a conversation session.

## Layers

```text
Pi runtime
  -> Career Skills and Extension
  -> domain tools
  -> application services
  -> career domain core
  -> SQLite and local artifacts
```

The first release is a local-first modular monolith. It does not require
microservices, a vector database, or subagents.

## Core invariants

1. Candidate Profile is the source of truth; resumes are projections.
2. Every generated career claim must be traceable to evidence.
3. A model may propose facts, but only validated tools can persist them.
4. Match score, confidence, and evidence coverage are separate values.
5. Official facts, community opinions, and model inferences must not be mixed.
6. User confirmation is required before candidate facts are changed.
7. The model performs semantic classification; versioned application code owns
   validation, weights, caps, and score calculation.
8. Capability Match and Employer Fit are independent decision dimensions.
9. Application progress is a user-confirmed event history, not a model-inferred
   mutable field.

## Resume ingestion

Document formats are added as Pi tool extensions. Every parser emits the same
versioned `ParsedResumeDocument` contract. Version 1.0 ships only
`parse_resume_pdf` for text-based PDFs.

```text
PDF -> parse_resume_pdf -> ParsedResumeDocument
    -> semantic extraction -> CandidateProfileDraft
    -> evidence validation -> user confirmation -> CandidateProfileRevision
```

The PDF parser performs deterministic extraction only. It does not invent,
rewrite, or persist candidate facts.

`import_resume` persists the normalized source document, after which Pi proposes
structured fields using evidence block ids. `propose_candidate_profile` resolves
those ids back to exact source text and stores a non-active draft. Only
`confirm_candidate_profile`, protected by an interactive user confirmation,
creates an immutable active profile revision.

## Candidate Profile maintenance

Confirmed profiles remain immutable. Corrections and new facts use a complete
replacement draft based on the current revision:

```text
CandidateProfileRevision
  + retained evidence ids
  + additional source-document blocks
  + explicit user statements
  -> complete amendment draft
  -> field-level diff
  -> user review and confirmation
  -> next CandidateProfileRevision
```

Complete replacement makes omissions visible as removals during confirmation.
Every retained or new value still needs evidence. A user statement records what
the user asserted and remains distinguishable from resume evidence; derived
Match Reports, CV wording, and STAR stories cannot become profile evidence.

The amendment stores its base revision. Confirmation transactionally rejects a
stale draft when another profile revision has become current. Revision history
therefore remains append-only and every downstream artifact can continue to pin
the exact profile revision it used. Detailed rules are recorded in
[`decisions/ADR-008-evidence-grounded-profile-amendments.md`](decisions/ADR-008-evidence-grounded-profile-amendments.md).

## Local persistence

Version 1.0 uses Node's built-in SQLite driver and stores data beneath the
trusted workspace:

```text
.career-steward/
  -> career-steward.sqlite
  -> career-steward.sqlite-wal
  -> career-steward.sqlite-shm
```

The initial schema separates source documents, proposed profile drafts, and
confirmed profile revisions. Pi session history is never used as the system of
record.

Schema version 2 adds three equivalent Opportunity boundaries:

- `job_opportunities` stores the original JD and stable `jd-b*` evidence blocks;
- `job_analysis_drafts` stores non-active model proposals;
- `job_analysis_revisions` stores user-confirmed, immutable analyses.

Explicit requirements always point to JD evidence. Inferred requirements also
point to related JD evidence, but carry a separate rationale and confidence so
that interpretation is never presented as employer-authored text.

Schema version 3 adds `job_match_reports`. Each report is append-only and is
versioned independently per opportunity. It records the exact Candidate Profile
revision, Job Analysis revision, matching policy version, and evaluator model
metadata used for the calculation.

Schema version 4 adds proposed and confirmed company research. Schema version 5
adds proposed and confirmed career preferences plus append-only Employer Fit
reports. Preference revisions are global to the user; company research and Fit
reports remain scoped to an opportunity in version 1.0.

Schema version 6 adds proposed and confirmed tailored CV artifacts. CV revisions
are append-only per opportunity and pin the profile, analysis, and Match Report
revisions used to generate them.

Schema version 7 adds append-only Interview Plan reports. Each revision pins its
profile, analysis, Match Report, and optional company research inputs.

Schema version 8 adds append-only `opportunity_events`. A unique
`(opportunity_id, sequence)` pair defines replay order. The store assigns this
sequence inside an immediate transaction and rejects a draft when its
`fromStatus` no longer matches current state.

Opportunity analysis and application progress are deliberately separate:

```text
JobOpportunity.status -> captured | analyzed
OpportunityEvent replay -> discovered | saved | preparing | applied
                        | interviewing | offer | terminal outcome
```

The first field answers whether the JD has a confirmed analysis. The second
answers where the user is in the application process.

Schema version 9 adds non-active `profile_amendment_drafts`. Confirmed changes
continue to append to `profile_revisions`; there is no mutable current-profile
row. Revision provenance distinguishes resume imports, amendments, and legacy
records created before provenance metadata existed.

## Local backup and recovery

Career Steward backs up SQLite through Node's online backup API. It does not
copy `career-steward.sqlite`, `-wal`, and `-shm` as independent files because
that can produce a torn or incomplete snapshot while WAL mode is active.

```text
active CareerStore (closed at tool boundary)
  -> SQLite online backup
  -> workspace-confined snapshot
  -> quick_check + schema version + SHA-256
```

Manual snapshots default to `career-steward-backups/`. Restore accepts only a
real file that resolves inside the trusted workspace. Before replacement it
validates the reviewed SHA-256 again and creates a consistent `pre-restore`
safety snapshot under `.career-steward/backups/`. Replacement uses a temporary
database and rollback path; the normal migration then upgrades supported
historical schemas to the current version.

Restore rejects schema version zero, a missing core-table signature, failed
SQLite integrity checks, and any schema newer than the running code. Pi must
have an interactive UI and receive explicit user confirmation before
restoration. Backup artifacts include all
personal and opportunity data and have no application-level encryption. These
boundaries are recorded in
[`decisions/ADR-012-confirmation-gated-local-data-recovery.md`](decisions/ADR-012-confirmation-gated-local-data-recovery.md).

## Dynamic career dashboard

`/career` and `get_career_dashboard` share one read-only application projection:

```text
confirmed revisions + proposed drafts + opportunity-event replay
  -> pipeline counts
  -> pending confirmations
  -> recent activity
  -> deterministic next-action suggestions
```

The dashboard is not a new source of truth. It does not store a second status,
confirm drafts, or execute its own recommendations. Pipeline counts come only
from replaying user-confirmed events, while pending drafts remain visibly
separate from confirmed revisions.

Derived artifacts are checked against the revisions they pin. A Match Report,
tailored CV, Interview Plan, or Employer Fit report may still exist in history
but is considered stale when any required current input revision has changed.
Suggestions then point to the next missing or stale prerequisite. They are
sorted deterministically, capped at eight, and suppressed when an equivalent
draft already awaits confirmation. The full pending-confirmation list is never
truncated. See
[`decisions/ADR-010-read-only-dynamic-career-dashboard.md`](decisions/ADR-010-read-only-dynamic-career-dashboard.md).

## Evidence-grounded matching

Matching starts only after both sides have a confirmed revision:

```text
CandidateProfileRevision + JobAnalysisRevision
  -> Pi semantic mapping
  -> complete Requirement–Evidence Matrix validation
  -> deterministic matching-policy/1.0
  -> immutable JobMatchReport revision
```

Pi classifies each job requirement as `strong`, `transferable`, `weak`, `gap`,
or `unknown` and cites stable candidate evidence ids for positive assessments.
It does not submit evidence text, weights, factors, points, or a final score.
The application resolves citations from the confirmed profile and rejects:

- missing, duplicate, or foreign requirement ids;
- invented candidate evidence ids;
- positive assessments without evidence;
- `gap` or `unknown` assessments that attach evidence.

The report exposes capability score, evidence coverage, confidence, and final
match score separately. A gap means available evidence shows that a requirement
is not met; unknown means the confirmed profile does not contain enough evidence
to decide. Contact identity fields are never part of the matching evidence pool.

A Match Report is a derived artifact, so it does not need the confirmation gate
used for candidate facts and interpreted JD requirements. Recalculation appends
a revision rather than overwriting history. Detailed formulas and caps are
defined in
[`decisions/ADR-003-deterministic-matching.md`](decisions/ADR-003-deterministic-matching.md).

## Decision dimensions

`matchScore` answers only “How well does confirmed candidate capability align
with confirmed job requirements?” It must not absorb company reputation,
community sentiment, overtime intensity, stability, compensation, or the user's
preferences. Those inputs will form a separately sourced Employer Fit report,
allowing a user to see cases such as high capability match but poor employer fit.

## Company intelligence

Pi may use an installed search/browser capability to discover URLs. Career
Steward then reacquires each selected public page through its bounded source
tool before accepting a structured research proposal:

```text
URL discovery
  -> fetch_company_source
  -> bounded source snapshot + response SHA-256
  -> source records
  -> source-grounded company claims
  -> structural validation
  -> user review and confirmation
  -> immutable CompanyResearchRevision
```

Sources are classified as official, professional reporting, community, or award
registry. Claims separately declare `official-fact`, `reported-fact`,
`community-sentiment`, `award-record`, or `inference`. Model inference is never
a source: it must cite real source records and preserve its rationale.

Community observations remain sentiment signals and may conflict. Employer
awards retain their issuer and time scope instead of becoming a permanent “best
employer” flag. The application validates URLs, timestamps, references, and
source/claim compatibility, but user confirmation remains necessary because
structural validity does not prove external truth.

`fetch_company_source` validates the initial URL and every redirect against the
public-network policy, pins the validated DNS address for the connection, and
limits time, redirects, response bytes, media types, and normalized text. It
does not execute JavaScript or infer a source tier. Confirmed source records may
retain its response hash and retrieval method for audit provenance. Detailed
network and extraction boundaries are recorded in
[`decisions/ADR-011-bounded-public-company-source-acquisition.md`](decisions/ADR-011-bounded-public-company-source-acquisition.md).

## Employer preferences and Fit

Employer preferences are user-owned facts. Pi may draft them after an interview,
but importance weights and deal breakers require explicit confirmation:

```text
CareerPreferenceRevision + CompanyResearchRevision
  -> Pi preference-to-claim mapping
  -> complete matrix validation
  -> deterministic employer-fit/1.0
  -> immutable EmployerFitReport revision
```

Every preference is classified as aligned, partially aligned, misaligned, or
unknown. Known assessments require same-dimension confirmed company claims;
unknown carries no claim and lowers evidence coverage instead of pretending to
be a negative result. Deal-breaker caps prevent a high average from hiding a
critical conflict or a critical research gap. Formulas and limitations are
recorded in
[`decisions/ADR-004-company-intelligence-and-employer-fit.md`](decisions/ADR-004-company-intelligence-and-employer-fit.md).

Career Steward does not automatically combine capability and Employer Fit into
one number:

```text
Opportunity decision view
  -> Capability Match: can I do this job?
  -> Employer Fit: do this company and working conditions fit me?
```

## Tailored CV projection

A tailored CV is a projection of confirmed evidence, not a second Candidate
Profile:

```text
CandidateProfileRevision
  + JobAnalysisRevision
  + current JobMatchReport
  -> Pi selection and careful rephrasing
  -> evidence/requirement validation
  -> deterministic Markdown renderer
  -> user review and confirmation
  -> immutable TailoredResumeRevision
```

Application code copies identity, contact information, employer, title, dates,
skills, and education from the confirmed profile. Model-written statements must
cite evidence that the current Match Report mapped to their cited requirements.
Experience bullets have the additional constraint that evidence must belong to
that experience. Gap and unknown requirements cannot be presented as claims.

Validation runs truthfulness constraints before ATS checks. The canonical 1.0
renderer emits single-column Markdown with conventional headings, no tables,
images, or HTML. Requirement coverage and ATS compatibility checks remain
separate: neither is a promise that a particular vendor's ATS will accept or
rank the document.

Confirmed Markdown and structured CV fields are the content source of truth.
`resume-renderer/1.0` exports canonical Markdown or an ATS-oriented DOCX. The
DOCX uses Letter pages, one reading column, standard headings, real list
paragraphs, and no tables, images, text boxes, headers, or footers. Renderers may
change typography and pagination but must not change wording or add claims.

Exports stay inside the trusted workspace, never overwrite an existing file,
and report source revisions, renderer version, byte length, and SHA-256. PDF is
deferred to a separate renderer and validation policy. The detailed decisions
are recorded in
[`decisions/ADR-005-evidence-grounded-ats-cv.md`](decisions/ADR-005-evidence-grounded-ats-cv.md)
and
[`decisions/ADR-009-ats-resume-export-renderers.md`](decisions/ADR-009-ats-resume-export-renderers.md).

## Interview preparation

Interview preparation projects the current Match Report into an actionable
matrix and schedule:

```text
CandidateProfileRevision
  + JobAnalysisRevision
  + current JobMatchReport
  + optional CompanyResearchRevision
  -> complete requirement preparation matrix
  -> evidence-scoped STAR stories
  -> time-bounded schedule and reverse questions
  -> immutable InterviewPlanReport revision
```

Every requirement appears exactly once. Strong items rehearse evidence-backed
advantages; transferable and weak items combine evidence with an honest
boundary; gaps and unknowns carry no candidate evidence and focus on honest
responses, learning, or clarification.

STAR stories bind to one confirmed experience. Their evidence must both belong
to that experience and have been mapped to the cited requirements. This blocks
cross-employer story assembly. Generated STAR wording is practice material and
cannot become Candidate Profile or CV evidence.

The schedule must cover every requirement. Metrics report requirement count,
evidence-backed items, risk items, STAR count, distinct days, and total minutes.
Career Steward does not create a readiness score or interview-pass probability.
Company claims may support neutral reverse-interview questions, particularly
when community signals need clarification. Detailed rules are recorded in
[`decisions/ADR-006-evidence-grounded-interview-plan.md`](decisions/ADR-006-evidence-grounded-interview-plan.md).

## Opportunity tracking

Application progress uses an event-sourced state machine:

```text
user statement
  -> Pi structures a candidate event
  -> application validates the transition
  -> interactive user confirmation
  -> transactional append
  -> timeline replay and pipeline projection
```

Pi does not infer progress from the JD, a match score, generated CV, interview
plan, email, or calendar entry. These may suggest a candidate event in a future
integration, but only the same confirmation-gated tool may persist it.

Events store both `happenedAt` and `recordedAt`. State replay follows the
transactional sequence, not occurrence time, so entering a historical date does
not rewrite later state. Terminal outcomes are `accepted`, `rejected`,
`withdrawn`, and `closed`; version 1.0 permits notes after a terminal outcome but
does not silently reopen it. See
[`decisions/ADR-007-event-sourced-opportunity-tracking.md`](decisions/ADR-007-event-sourced-opportunity-tracking.md).

## Evolution seams

- `DocumentParser`: add DOCX, HTML, Markdown, or OCR adapters.
- `CompanySource`: add official and community information providers.
- `MatchStrategy`: add role-specific matching policies.
- `ResumeRenderer`: add PDF and future presentation formats without changing
  confirmed content.
- `TaskExecutor`: add optional subagent execution without changing domain code.
- `OpportunityEventSource`: add email, calendar, browser, or ATS detectors that
  create confirmation candidates without gaining direct write authority.
