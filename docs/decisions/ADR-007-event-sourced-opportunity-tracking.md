# ADR-007: User-Confirmed Event-Sourced Opportunity Tracking

- Status: Accepted
- Date: 2026-11-01

## Context

Career Steward needs to manage saved, applied, interviewing, offer, and terminal
states. These are personal workflow facts, not conclusions that a model should
infer from a JD. A mutable status column would lose history, make accidental
changes difficult to diagnose, and provide no safe boundary for future email or
calendar integrations.

The existing `JobOpportunity.status` records analysis lifecycle only:
`captured` or `analyzed`. It must not be overloaded with application progress.

## Decision

Application progress is an append-only stream of user-confirmed
`OpportunityEvent` records. With no event, an opportunity is `discovered`.
Events are replayed in their recorded sequence to derive the current pipeline
status:

`discovered -> saved -> preparing -> applied -> interviewing -> offer`

The terminal outcomes are `accepted`, `rejected`, `withdrawn`, and `closed`.
Some stages may be skipped when that reflects reality—for example a user may
record an application directly from `discovered`. Invalid transitions, such as
accepting an offer before an offer is recorded, are rejected by the application
state machine.

`note-added` preserves the current status and is allowed in every state. In 1.0,
terminal states cannot be reopened; they can only receive notes. Reopening can
be introduced later as an explicit event and transition policy.

## Confirmation and automation boundary

Every state-changing event requires interactive user confirmation. Pi may map a
natural-language statement such as “I submitted this role yesterday” into a
structured candidate event, but it cannot silently persist that event.

Future email, calendar, ATS, or browser integrations may detect candidate
events. They must present those events for confirmation and use the same append
path. Integrations do not receive a separate authority to mutate pipeline state.
Persisted events therefore carry the fixed source `user-confirmed`; this value
is not model-selectable.

## Ordering and time

Each opportunity owns a contiguous, transactionally assigned sequence. Replay
uses this sequence rather than `happenedAt`. This allows a user to enter an event
with a historical occurrence time without silently rewriting later state.
`recordedAt` captures when Career Steward accepted the event, while `happenedAt`
captures when the real-world action occurred.

Storage must re-read the current event stream inside the append transaction and
verify the draft's `fromStatus`. This optimistic concurrency check prevents a
confirmation based on stale state from overwriting a newer user action.

## Read models

The opportunity timeline returns the immutable event stream and derived current
status. The pipeline view is a rebuildable projection containing company, role,
analysis status, pipeline status, milestone times, and interview event count.
Neither view is a second source of truth.
