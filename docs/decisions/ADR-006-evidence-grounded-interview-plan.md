# ADR-006: Evidence-Grounded Interview Preparation Plan

- Status: Accepted
- Date: 2026-11-01

## Context

Interview preparation must turn the Match Report into an actionable plan without
turning missing capabilities into invented stories. Generic question lists are
easy to produce but provide little differentiation and cannot explain why time
is being spent on a topic.

## Decision

Every confirmed job requirement appears exactly once in an Interview Preparation
Matrix. Its Match Report assessment determines the preparation mode:

| Assessment | Focus |
|---|---|
| `strong` | leverage the strength with concise evidence |
| `transferable` | demonstrate how experience transfers |
| `weak` | strengthen knowledge and use conservative wording |
| `gap` | prepare an honest response and a learning plan |
| `unknown` | clarify missing profile information and employer expectations |

Strong, transferable, and weak items cite only evidence already mapped to that
requirement. Gap and unknown items carry no candidate evidence. Every assessment
except strong requires an explicit honest boundary.

## STAR boundary

A STAR story binds to one confirmed experience. Every cited evidence id must:

1. exist in the confirmed Candidate Profile;
2. be mapped to one of the story's requirements in the current Match Report;
3. belong to the selected experience.

This prevents combining a situation from one employer with an action or result
from another. Evidence proves provenance, not perfect wording, so STAR text
remains a practice suggestion and never becomes Candidate Profile evidence.

## Schedule and reverse questions

The schedule must cover every requirement at least once and records day,
duration, activities, and requirement ids. Career Steward reports total minutes
and distinct scheduled days but does not calculate an interview-pass probability
or a synthetic readiness score.

Reverse-interview questions may cite confirmed Company Research claims. Community
sentiment and uncertain signals are converted into neutral professional questions
rather than asserted as facts about the employer.

## Lifecycle

An Interview Plan is a derived planning artifact. Creation appends an immutable
revision containing profile, analysis, Match Report, optional company research,
and evaluator provenance. It does not require a confirmation gate because it
does not modify candidate or employer facts. It also cannot be used as evidence
for a Candidate Profile or tailored CV.

Re-generation creates a new revision. Changes to the current profile or job
analysis require a fresh Match Report before another plan can be generated.
