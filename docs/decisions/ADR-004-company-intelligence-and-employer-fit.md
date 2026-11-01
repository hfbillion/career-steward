# ADR-004: Source-Tiered Company Intelligence and Separate Employer Fit

- Status: Accepted
- Date: 2026-11-01

## Context

Career Steward must evaluate more than a job description. Users need to know a
company's reputation, community feedback, workload, stability, and whether an
employer award is credible. These inputs are time-sensitive and often conflict.
Treating them as equivalent facts, or blending them directly into capability
matching, would create an opaque and unstable recommendation.

## Decision

Company research is stored as source-backed claims. Version 1.0 distinguishes
four source types:

- `official`: employer websites, filings, policies, and first-party statements;
- `professional-reporting`: established journalism and professional research;
- `community`: employee or candidate discussions and review communities;
- `award-registry`: the organization that issued an employer award or ranking.

Model inference is not a fifth source type. An inference must cite one or more
real sources and carry a separate rationale and confidence.

## Claim basis

Each claim declares how it should be interpreted:

- `official-fact` needs an official source;
- `reported-fact` needs professional reporting;
- `community-sentiment` needs a community source and explicit sentiment;
- `award-record` needs an award registry, `employer-recognition` category, and
  time scope;
- `inference` needs cited sources plus model rationale.

Community claims represent sentiment or a signal, not a verified company fact.
An isolated post cannot become a general conclusion such as “the company always
works overtime.” Conflicting sources remain visible as separate claims.

“Best employer” is never stored as a permanent boolean. The system records the
award or ranking, issuer, applicable year or period, scope, and source. Employer
Fit may later interpret that record against a user's preferences.

## Lifecycle

Pi may use whatever browsing and search tools are available to discover sources.
Career Steward provides `fetch_company_source` to reacquire selected public HTML,
XHTML, or text pages through a bounded network policy, then persists research
only through its validated domain tool.
The application validates URL shape, timestamp shape, local source references,
claim/source compatibility, and coverage. It does not claim that a URL is true
merely because it is syntactically valid.

Company research is proposed, reviewed, and explicitly confirmed. Each confirmed
revision is immutable and scoped to an opportunity in version 1.0. A future
company-level cache may reuse research across opportunities after adding entity
resolution and freshness policies.

## Employer Fit boundary

Employer Fit is calculated only from:

1. a confirmed user preference revision;
2. a confirmed company research revision;
3. a complete preference-to-claim assessment;
4. a versioned deterministic policy.

It remains separate from Capability Match. A role can therefore have high
capability alignment and low employer fit, or the reverse. Any combined ranking
must expose both dimensions rather than hiding them in one unexplained score.

## Employer Fit policy 1.0

User preferences have importance weights from 1 to 5. Pi maps each preference to
confirmed company claims using one assessment:

| Assessment | Factor |
|---|---:|
| `aligned` | 1.00 |
| `partially-aligned` | 0.60 |
| `misaligned` | 0 |
| `unknown` | excluded from alignment denominator |

Positive and negative assessments require same-category company claims.
`unknown` carries no claim and represents insufficient research rather than a
negative employer judgment.

```text
alignmentScore = earned known points / known preference weight * 100
evidenceCoverage = known preference weight / total preference weight * 100
confidenceScore = weighted semantic confidence * claim confidence
                  * coverage ratio * 100
employerFitScore = alignmentScore * (0.7 + 0.3 * coverage ratio)
```

If a deal breaker is `misaligned`, Employer Fit is capped at 49. If no deal
breaker is misaligned but one is `unknown`, Employer Fit is capped at 69. A cap
is recorded only when it changes the score. Each report records the preference
revision, company research revision, policy version, and evaluator metadata.

## Version 1.0 limitations

- URL discovery remains orchestrated by Pi; Career Steward does not ship a
  search engine, crawler, or source-specific API adapter.
- The persistence tool does not independently repeat the bounded fetch. It may
  retain the fetch response hash and retrieval method, but these do not prove
  source authenticity.
- JavaScript-rendered pages, authenticated sources, PDFs, and non-standard ports
  require a future source adapter or explicit manual evidence workflow.
- Freshness is recorded through publication and retrieval timestamps, but
  automated expiry is deferred.
- Community sample size and selection bias remain warnings for user review.
