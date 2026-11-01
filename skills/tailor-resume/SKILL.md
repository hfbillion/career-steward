---
name: tailor-resume
description: Create a job-specific, ATS-compatible resume from confirmed Candidate Profile evidence. Use when the user asks to tailor, rewrite, validate, or export a CV for a target JD.
---

# Tailor Resume

Build the resume from confirmed Candidate Profile evidence and the target JD.
Create a coverage strategy before drafting. Do not add unsupported employers,
titles, dates, technologies, metrics, or achievements.

Run truthfulness validation before ATS compatibility checks. Describe ATS output
as a compatibility report, never as a guaranteed acceptance score.

## Build a tailored CV

1. Call `get_candidate_profile`, `get_job_opportunity`, and `get_job_match`.
   Stop if the profile, confirmed analysis, or Match Report is missing. Recompute
   the Match Report when its profile or analysis revision is stale.
2. Use the Match Report requirement matrix as the only targeting map:
   - `strong` evidence can support direct language;
   - `transferable` evidence needs careful transfer framing;
   - `weak` evidence needs conservative wording and user review;
   - `gap` and `unknown` requirements must not become CV claims.
3. Draft the headline, professional summary, and experience bullets. Every
   generated statement must cite at least one candidate evidence id and one
   requirement id. Cite only evidence attached to those requirements in the
   current Match Report.
4. Keep achievements under the experience where their evidence originated. Do
   not move an accomplishment, metric, technology, or responsibility between
   employers.
5. Select skills by their zero-based index in the returned confirmed profile and
   cite the supported requirement ids. Do not submit skill text: the application
   copies the confirmed value.
6. Select education by profile index. The application also copies name, email,
   phone, employer, title, and dates directly from the confirmed profile.
7. Call `propose_tailored_resume`. Show the full Markdown plus:
   - covered and uncovered requirements;
   - weighted requirement coverage;
   - every ATS compatibility check;
   - transferable/weak wording warnings;
   - uncovered must requirements.
8. End the turn without confirmation. Only after the user explicitly approves
   the exact draft in a later turn, call `confirm_tailored_resume`.

Use `get_tailored_resume` to retrieve the latest confirmed revision.

## Export a confirmed CV

1. Export only after `confirm_tailored_resume` has created an immutable
   revision. Never export a draft as if it were approved.
2. Call `export_tailored_resume` with `markdown` for the canonical source file or
   `docx` for the ATS-oriented single-column Word document.
3. Use the default `career-steward-exports` directory unless the user requests a
   workspace-relative alternative. Never construct an absolute or parent path.
4. Report the returned relative path, source revision, and format. Do not claim
   success when an existing file blocked the export.
5. Do not rewrite, summarize, translate, or add content during export. A content
   change requires a new tailored CV proposal and confirmation.

Version 1.0 exports canonical Markdown and single-column DOCX. It does not yet
export PDF. Describe the DOCX as ATS-compatible, never as guaranteed vendor
acceptance or ranking.
