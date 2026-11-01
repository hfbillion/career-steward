# ADR-003: Deterministic, Evidence-Grounded Job Matching

- Status: Accepted
- Date: 2026-10-31
- Policy version: `matching-policy/1.0`

## Context

Career Steward must compare a confirmed Candidate Profile with a confirmed Job
Analysis. A language model is useful for recognizing semantic similarity and
transferable experience, but an unconstrained model-generated percentage is not
repeatable, auditable, or suitable for comparing multiple opportunities.

The system also needs to distinguish an actual capability gap from missing
candidate evidence. Treating both as zero would discourage valid applications
and hide what information the user should add to the profile.

## Decision

Use a two-stage matching process:

1. Pi proposes a complete Requirement–Evidence Matrix.
2. Deterministic TypeScript applies a versioned scoring policy.

Pi may choose one assessment per confirmed job requirement:

- `strong`: direct and sufficient candidate evidence;
- `transferable`: related evidence demonstrates a portable capability;
- `weak`: evidence is relevant but insufficient;
- `gap`: confirmed information indicates the requirement is not met;
- `unknown`: the confirmed profile does not contain enough information.

Pi never supplies candidate facts, source text, weights, factors, points, or the
final score. It supplies requirement ids, stable candidate evidence ids,
assessment, explanation, and semantic confidence. The application resolves ids
to confirmed records before scoring.

## Matrix invariants

1. Only confirmed Candidate Profile and Job Analysis revisions are accepted.
2. Every confirmed requirement appears exactly once.
3. Unknown, duplicate, or cross-opportunity requirement ids are rejected.
4. `strong`, `transferable`, and `weak` require at least one confirmed evidence id.
5. `gap` and `unknown` must not carry candidate evidence.
6. Candidate evidence text and source locations come from storage, not model input.
7. Contact identity fields (`name`, `email`, and `phone`) are excluded from the
   capability-matching evidence pool.

## Stable evidence identity

Resume evidence uses:

```text
resume:<source-document-sha256>:<parsed-block-id>
```

The id is stable when the same source document and block are reused across
profile fields. Future user-authored evidence will use a different namespace.

## Scoring policy 1.0

Priority weights:

| Priority | Weight |
|---|---:|
| `must` | 5 |
| `should` | 3 |
| `nice-to-have` | 1 |

Assessment factors:

| Assessment | Factor |
|---|---:|
| `strong` | 1.00 |
| `transferable` | 0.65 |
| `weak` | 0.30 |
| `gap` | 0 |
| `unknown` | excluded from capability denominator |

Metrics:

```text
capabilityScore = earned known points / known requirement weight * 100
evidenceCoverage = known requirement weight / total requirement weight * 100
confidenceScore = weighted known confidence / known weight * coverage ratio * 100
matchScore = capabilityScore * (0.7 + 0.3 * coverage ratio)
```

Caps:

- a `must + gap` caps `matchScore` at 69;
- otherwise a `must + unknown` caps `matchScore` at 79;
- a cap is recorded only when it actually changes the score.

## Report lifecycle

A Match Report is a derived artifact, not a candidate or employer fact. It does
not require confirmation before creation. Every calculation creates an immutable
revision containing:

- Candidate Profile revision;
- Job Analysis revision;
- matching policy version;
- evaluator model metadata when available;
- resolved matrix and metrics.

Recalculation never overwrites an older report.

Version 1.0 calculates against the latest confirmed Candidate Profile revision
and latest confirmed Job Analysis revision for the requested opportunity. The
selected revision numbers are embedded in the report, so later profile or job
analysis changes do not alter historical results. Running the calculation again
after either side changes creates a new Match Report revision.

## Boundaries

`matchScore` measures candidate capability against job requirements. Employer
reputation, work intensity, stability, compensation, and personal preferences
belong to Employer Fit and must not be mixed into this score.

## Consequences

Benefits:

- scores are reproducible and testable;
- every positive assessment is traceable to confirmed evidence;
- missing information remains visible instead of becoming a false rejection;
- policy changes can be versioned and evaluated.

Trade-offs:

- semantic mapping can still vary by model;
- scores are decision support, not hiring probabilities;
- evidence quality depends on the confirmed Candidate Profile.
