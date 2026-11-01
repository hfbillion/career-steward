---
name: manage-profile
description: Import and maintain a candidate's evidence-backed Career Steward profile. Use when the user provides a resume, wants to review parsed career facts, or asks to update personal experience, skills, education, or achievements.
---

# Manage Candidate Profile

Treat Candidate Profile as the source of truth and every resume as an input or
projection. Never invent or silently upgrade a candidate fact.

Use `get_career_dashboard` when the user asks for an overall status or what to
do next. Treat its actions as read-only suggestions. A pending profile draft is
not an active profile and still requires the confirmation flow below.

## Import a resume

1. Confirm that the input is a text-based PDF.
2. Call `import_resume`; do not call the format parser directly.
3. Convert normalized blocks into `propose_candidate_profile` arguments.
4. Cite one or more real `evidenceBlockIds` for every proposed value.
5. Call `propose_candidate_profile` to validate and save a non-active draft.
6. Show the complete proposed facts and warnings to the user, then end the turn.
7. Only after the user explicitly approves in a later turn, call
   `confirm_candidate_profile`. The tool will request interactive confirmation
   before creating an immutable profile revision.

Use `get_candidate_profile` when another workflow needs confirmed candidate
facts. Never treat an unconfirmed draft as the active profile.

## Amend a confirmed profile

1. Call `get_candidate_profile` and use its exact current revision as
   `baseRevision`. Do not edit an older revision unless the user is explicitly
   inspecting history.
2. Build the complete desired profile, including every field the user wants to
   retain. An omitted field or experience is treated as a proposed removal.
3. Give every field at least one supported evidence citation:
   - use `existing` with an evidence id from the current profile when retaining
     an already supported fact;
   - use `resume-block` with a real block id from the original imported PDF when
     correcting extraction or surfacing previously unused resume evidence;
   - use `user-statement` only for a fact the user explicitly supplied. Preserve
     the user's meaning and never convert model-generated text into a user
     statement.
4. Preserve the stable `id` for every retained experience. Omit the id only when
   adding a genuinely new experience. Never invent an id for an existing item.
5. Call `propose_candidate_profile_amendment`. Show the reason, every addition,
   update, removal, and the evidence source. End the turn without confirming.
6. Only after explicit approval in a later turn, call
   `confirm_candidate_profile_amendment`. The interactive confirmation and base
   revision check cannot be bypassed.

Use `list_candidate_profile_revisions` for revision summaries and
`get_candidate_profile_revision` to inspect one historical version. History is
immutable; rollback must be proposed as a new amendment rather than deleting or
rewriting a revision.

Scanned PDFs, OCR, DOCX, images, and password-protected PDFs are not supported in
the first version. Explain the limitation rather than guessing from incomplete
text.
