# ADR-005: Evidence-Grounded ATS-Compatible Tailored CV

- Status: Accepted
- Date: 2026-11-01

## Context

Career Steward must produce a CV tailored to a target job without inventing
experience, titles, dates, technologies, metrics, or achievements. A language
model can select and rephrase relevant evidence, but free-form resume generation
would bypass the confirmed Candidate Profile and make unsupported keyword
stuffing difficult to detect.

ATS products also differ. Career Steward can validate structural compatibility,
but it cannot honestly promise acceptance by every proprietary parser.

## Decision

A tailored CV is a projection of four versioned inputs:

1. confirmed Candidate Profile revision;
2. stored Job Opportunity and confirmed Job Analysis revision;
3. current Match Report revision based on those exact revisions;
4. a model-proposed selection and rephrasing plan.

The Match Report must not be stale. If either the Candidate Profile or Job
Analysis has changed, matching must be recalculated before CV generation.

## Grounding rules

- Contact details, employer names, job titles, dates, skill labels, and education
  values are copied by application code from the confirmed profile.
- Every model-generated headline, summary, and experience bullet cites candidate
  evidence ids and target requirement ids.
- Every cited candidate evidence id must have been mapped to at least one cited
  requirement in the current Match Report.
- Experience bullets may cite only evidence belonging to that experience. This
  prevents moving an achievement between employers.
- Skill selection uses a profile index pinned by the recorded profile revision
  and must overlap evidence mapped to every cited requirement.
- Requirements assessed as `gap` or `unknown` cannot appear as CV claims.
- `transferable` and `weak` requirements may be used but always produce review
  warnings.

Evidence linkage proves provenance, not perfect semantic equivalence. The model
can still overstate source text while citing it, so the tailored CV remains a
draft until the user explicitly confirms it.

## Canonical artifact

Version 1.0 uses single-column Markdown as the canonical CV artifact. The
renderer owns reading order and standard headings and emits no tables, images,
or multi-column layout. DOCX and PDF are future `ResumeRenderer` projections;
they must not change the confirmed content.

## ATS compatibility

Career Steward reports deterministic checks:

- conventional headings;
- single reading order;
- no tables, images, or HTML;
- confirmed contact details;
- evidence-grounded generated statements.

Requirement coverage is computed separately using JD priority weights. Coverage
does not mean the candidate satisfies an uncovered gap, and ATS checks are never
presented as a guaranteed acceptance score.

## Lifecycle

Pi proposes a CV draft, the application validates and renders it, and the user
reviews the Markdown plus warnings. Confirmation creates an immutable revision.
Re-generation appends another revision rather than overwriting history.
