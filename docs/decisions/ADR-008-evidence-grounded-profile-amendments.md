# ADR-008: Evidence-Grounded Candidate Profile Amendments

- Status: Accepted
- Date: 2026-11-01

## Context

A Candidate Profile cannot remain useful if it can only be created from the
first imported resume. Users need to correct parsing mistakes, add missing
facts, and record newer experience. Direct mutation would break every Match
Report, tailored CV, and Interview Plan that cites a specific profile revision.
Allowing a model to patch arbitrary fields would also weaken the evidence
boundary.

## Decision

Profile maintenance uses a full replacement draft based on one confirmed
revision. The proposal declares `baseRevision`, a reason, the complete desired
profile, and evidence for every retained or new value. Application code computes
the field-level additions, updates, and removals. A proposal with no material
change is rejected.

Full replacement is intentional: the confirmation view can expose accidental
omissions before persistence. Confirming never updates an existing revision; it
appends the next immutable `CandidateProfileRevision`.

## Evidence sources

An amended field may cite one or more of:

1. an evidence id already present in the base profile;
2. a real block from the profile's imported PDF source document;
3. an explicit user statement shown again during confirmation.

User statements prove that the user supplied the statement, not that Career
Steward independently verified the underlying claim. They use `sourceType=user`
and remain distinguishable from resume evidence. Model-generated Match Reports,
CV text, STAR stories, JD claims, and company research cannot become Candidate
Profile evidence.

## Concurrency and confirmation

An amendment draft is non-active. Confirmation always requires an interactive
user decision. Inside the persistence transaction, Career Steward re-reads the
current profile revision and compares it with `baseRevision`. If another profile
revision was confirmed after the draft was created, the stale amendment is
rejected and must be rebuilt against the current version.

Revision metadata records whether a version came from resume import or an
amendment. Amendment metadata retains its draft id, base revision, and reason.
Existing stored revisions without this optional metadata remain valid and are
reported as legacy revisions.

## Version 1.0 boundary

An amendment keeps the base profile's source document identity. Importing a new
resume continues through the resume-import workflow. Conflict merging, revision
rollback, multiple active personas, and evidence spanning multiple imported
documents are deferred; rollback can later be expressed as a new amendment
rather than rewriting history.
