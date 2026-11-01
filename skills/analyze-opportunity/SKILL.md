---
name: analyze-opportunity
description: Analyze a job description and employer using candidate evidence. Use for JD requirements, company reputation, workload, stability, employer fit, or explainable candidate-to-job matching.
---

# Analyze Opportunity

Separate explicit JD requirements from inferred expectations. Separate official
company facts, professional reporting, community opinions, and model inference.
Every external claim needs a URL, retrieval time, and confidence.

Use `get_career_dashboard` for a cross-opportunity status check. Its pipeline is
derived from confirmed events and its next actions are deterministic hints; do
not report a suggestion as an executed analysis, application, interview, or
Offer decision.

## Capture and analyze a JD

1. Ask for company name and job title when they are not clear from the request.
2. Call `create_job_opportunity` with the supplied JD text. Do not analyze an
   unpersisted copy of the JD.
3. Build `propose_job_analysis` arguments from the returned `jd-b*` blocks.
4. Cite at least one real block id for every requirement.
5. Mark text directly stated by the JD as `explicit`.
6. Mark interpretations as `inferred` and provide both a rationale and calibrated
   confidence. Never present an inference as quoted employer language.
7. Call `propose_job_analysis`, show explicit requirements, inferred requirements,
   priorities, and warnings to the user, then end the turn.
8. Only after explicit approval in a later turn, call `confirm_job_analysis`.

Use `get_job_opportunity` when later workflows need confirmed job requirements.
Do not calculate a match from an unconfirmed analysis.

## Calculate an evidence-grounded match

1. Call `get_candidate_profile` and `get_job_opportunity`. Stop when either does
   not contain a confirmed revision.
2. Evaluate every requirement in the confirmed analysis exactly once. Preserve
   its requirement id; do not introduce or omit requirements.
3. Use `strong` only for direct and sufficient confirmed evidence.
4. Use `transferable` for related experience that demonstrates a portable
   capability, and explain the transfer.
5. Use `weak` when evidence is relevant but insufficient.
6. Use `gap` only when confirmed information supports that the candidate does
   not meet the requirement. Do not attach evidence to `gap`.
7. Use `unknown` when the profile is silent or insufficient to decide. Do not
   convert missing evidence into a gap, and do not attach evidence to `unknown`.
8. For `strong`, `transferable`, and `weak`, cite only stable evidence ids found
   in the confirmed Candidate Profile. Never copy evidence text into the tool
   arguments and never use name, email, or phone as capability evidence.
9. Supply a calibrated semantic confidence from 0 to 1 and a concise explanation
   for each mapping. Do not supply weights, factors, earned points, caps, or any
   score; those belong to the versioned application policy.
10. Call `calculate_job_match` with the complete matrix. Report capability,
    evidence coverage, confidence, and final match as separate values, followed
    by strengths, transferable capabilities, critical gaps, and unknowns.

Match Reports are derived and do not require user confirmation. Recalculation
creates a new immutable revision. Use `get_job_match` to retrieve the latest one.

## Research the employer

1. Use available search or browser tools only to discover candidate URLs. Prefer
   primary company sources for official facts, reputable professional reporting
   for independently reported facts, community sources for employee sentiment,
   and the award issuer for employer recognition.
2. Call `fetch_company_source` for every selected URL. Do not use a search-result
   snippet as evidence when the linked page can be retrieved. Do not work around
   a blocked private address, unsupported media type, size limit, or failed
   redirect.
3. Select supporting excerpts only from the returned snapshot. Preserve its
   `finalUrl`, `retrievedAt`, `contentSha256`, and warnings. Set
   `retrievalMethod` to `career-steward-fetch`; do not claim that method for a
   source that did not pass through the tool.
4. Use separate source keys inside one `propose_company_research` call. Do not
   submit the same URL repeatedly to create false source volume.
5. Classify every claim basis correctly:
   - `official-fact` requires an official source;
   - `reported-fact` requires professional reporting;
   - `community-sentiment` requires community evidence and sentiment;
   - `award-record` requires an award registry and time scope;
   - `inference` requires cited sources, rationale, and confidence.
6. Keep conflicting claims. Do not average disagreement into a stronger fact.
   Add warnings for small community samples, selection bias, stale material, or
   ambiguous company identity.
7. Call `propose_company_research`. Show source tiers, claims, conflicts,
   coverage gaps, and warnings to the user, then end the turn.
8. Only after explicit approval in a later turn, call
   `confirm_company_research`. Use `get_company_research` in later workflows.

## Evaluate Employer Fit

1. If no confirmed preferences exist, interview the user about reputation,
   culture, work intensity, stability, compensation, growth, and employer
   recognition. Ask which dimensions are deal breakers.
2. Call `propose_career_preferences`, show every desired outcome, importance
   weight, and deal breaker, then end the turn. Only after later explicit
   approval call `confirm_career_preferences`.
3. Load `get_career_preferences` and `get_company_research`. Evaluate every
   confirmed preference exactly once.
4. Use `aligned`, `partially-aligned`, or `misaligned` only with confirmed claim
   ids from the same dimension. Use `unknown` with no claim when research is
   insufficient. Do not turn missing research into a negative judgment.
5. Call `calculate_employer_fit` with the complete mapping. Report alignment,
   evidence coverage, confidence, final Fit, deal-breaker caps, concerns, and
   unknowns separately. Use `get_employer_fit` to retrieve the latest report.

Never mix reputation, overtime, stability, compensation, or preference data
into Capability Match. Present Capability Match and Employer Fit side by side.

## Track application progress

1. Treat application progress as a user-owned fact. Do not infer a state change
   from a captured JD, confirmed analysis, match score, company research,
   tailored CV, or interview plan.
2. When the user explicitly reports progress, map it to one supported event and
   call `record_opportunity_event`. Preserve the user's actual occurrence time
   in `happenedAt` when supplied.
3. For `interview-scheduled`, include the scheduled time and round. Add the
   format only when known. Do not attach interview details to other events.
4. The tool always requires interactive confirmation. Never claim that progress
   was recorded when the user cancelled confirmation or when no interactive UI
   is available.
5. Use `get_opportunity_timeline` for one opportunity and
   `list_opportunity_pipeline` for the cross-opportunity view. Explain
   `analysisStatus` and `pipelineStatus` separately.
6. Terminal outcomes may receive notes but cannot be reopened in version 1.0.
   Ask the user to create a new opportunity when the employer opens a genuinely
   new hiring process.

Future email, calendar, browser, or ATS integrations may propose an event, but
they must use the same confirmation-gated tool. They never write pipeline state
directly.
