---
name: prepare-interview
description: Build an evidence-grounded interview preparation plan for a specific opportunity. Use for technical, system-design, behavioral, resume deep-dive, or reverse-interview preparation.
---

# Prepare Interview

Use the structured JD, match gaps, targeted resume claims, and company evidence.
Create a time-bounded plan and prioritize critical gaps. Include technical,
system-design, behavioral, resume deep-dive, and reverse-interview questions.

Turn uncertain company signals into professional questions for the employer
rather than presenting community opinions as established fact.

## Build the plan

1. Call `get_candidate_profile`, `get_job_opportunity`, and `get_job_match`.
   Stop if the confirmed profile, confirmed analysis, or current Match Report is
   missing. Recalculate a stale Match Report before continuing.
2. Optionally call `get_company_research` when preparing reverse-interview
   questions. Company research is not required for general questions.
3. Create exactly one preparation item for every Match Report requirement:
   - `strong`: rehearse a concise evidence-backed strength;
   - `transferable`: explain the transfer and state its boundary;
   - `weak`: strengthen knowledge and use conservative wording;
   - `gap`: attach no evidence; prepare an honest answer and learning plan;
   - `unknown`: attach no evidence; identify missing information and clarify it.
4. Positive items may cite only candidate evidence ids already attached to that
   requirement in the Match Report. Every non-strong item needs an explicit
   `honestBoundary`.
5. Add STAR stories only when useful. Bind each story to one confirmed
   experience and use only evidence from that experience that was also mapped to
   the cited requirements. Never combine employers, metrics, or outcomes.
6. Create a time-bounded schedule. Every requirement must appear in at least one
   session. Activities should include appropriate technical, system-design,
   behavioral, resume deep-dive, or gap-mitigation practice.
7. Add reverse-interview questions. If a question is motivated by company
   research, cite confirmed company claim ids and use neutral language. Ask how
   work operates; do not accuse the employer based on community sentiment.
8. Call `create_interview_plan`. Present requirement strategies, honest
   boundaries, STAR stories, schedule, reverse questions, metrics, and warnings.

Use `get_interview_plan` to retrieve the latest revision. The plan is a derived
practice artifact: do not copy generated STAR wording into Candidate Profile or
CV evidence. Do not invent an interview-pass probability or readiness score.
