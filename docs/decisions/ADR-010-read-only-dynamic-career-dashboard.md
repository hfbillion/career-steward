# ADR-010: Read-only dynamic Career Dashboard

- Status: Accepted
- Date: 2026-11-01

## Context

Career Steward already stores confirmed profile revisions, opportunities,
derived career artifacts, pending confirmation drafts, and append-only
application events. The original `/career` command only displayed a static
capability message. It could not answer the practical question: “What is true
now, and what should I do next?”

A dashboard is useful, but it sits close to several safety boundaries. It must
not turn an LLM suggestion into a state transition, treat a proposed draft as a
confirmed fact, or hide that a derived artifact was built from old input
revisions.

## Decision

Career Steward exposes one dynamic, read-only dashboard projection through both
`/career` and `get_career_dashboard`. The command renders a compact Chinese
summary; the tool returns the same projection as structured data. Neither path
performs writes.

The projection contains:

1. the current confirmed Candidate Profile revision and basic coverage counts;
2. explicit counts for every application pipeline status;
3. every proposed draft that still requires user confirmation;
4. the five most recently recorded opportunity events;
5. at most eight deterministic next-action suggestions.

The pipeline is replayed from `opportunity_events`. The dashboard never reads a
model-maintained mutable status. Pending confirmations are assembled with one
read-only SQL `UNION ALL` across the six confirmation-gated draft tables. This
does not add a new persistence model or schema version.

## Artifact freshness

Existence alone is insufficient. The dashboard treats a derived artifact as
current only when its pinned inputs equal the latest confirmed inputs:

- Match Report: current Profile revision + current Job Analysis revision;
- tailored CV: current Profile + Job Analysis + Match Report revisions;
- Interview Plan: current Profile + Job Analysis + Match Report + current
  optional Company Research revision;
- Employer Fit: current Career Preferences + Company Research revisions.

If a Profile, analysis, research report, or preference revision changes, the
related downstream artifact becomes stale without being deleted. The dashboard
then recommends regeneration while the historical artifact remains queryable.

## Suggestion policy

Suggestions are deterministic orchestration hints, not autonomous decisions.
The policy applies these rules:

- pending confirmations are high-priority review actions;
- a missing confirmed Profile blocks reliable matching and generation;
- each active opportunity receives at most one next prerequisite action;
- interview preparation is high priority once the pipeline reaches
  `interviewing`;
- company research becomes relevant after application and urgent at Offer;
- Employer Fit requires both confirmed preferences and company research;
- terminal opportunities receive no next-action suggestion;
- when an equivalent draft is already pending, the dashboard recommends review
  instead of proposing a duplicate draft;
- high, medium, and low priorities are sorted deterministically and capped at
  eight suggestions.

The complete pending-confirmation list is never truncated even when only eight
items can appear in `nextActions`.

## Consequences

- `/career` becomes immediately useful without introducing a web frontend.
- Pi can use structured dashboard data to explain workflow state, while Career
  Steward retains ownership of facts and revision rules.
- The dashboard cannot silently confirm a draft, record an application event,
  or accept/reject an Offer.
- The first implementation performs several indexed local SQLite reads per
  opportunity. This N+1 shape is acceptable for a local 1.0 dataset and keeps
  domain rules independent from a database-specific denormalized view.
- Future UI, notification, email, or calendar integrations may consume the same
  projection. They must still call the existing confirmation-gated write tools
  for any mutation.
