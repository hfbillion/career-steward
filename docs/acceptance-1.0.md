# Career Steward 1.0 acceptance

[English](acceptance-1.0.md) | [简体中文](zh-CN/acceptance-1.0.md)

The automated acceptance journey proves that the local modular monolith can
complete one coherent job-search workflow without bypassing its persistence or
confirmation boundaries.

## Automated journey

Run:

```bash
npm run test:acceptance
```

The test uses a generated text PDF containing a fictional software architect.
It executes these production services and Store transactions in order:

1. parse PDF evidence and confirm Candidate Profile revision 1;
2. capture a JD and confirm its requirement analysis;
3. calculate and persist a Match Report with two strengths and one explicit
   Kubernetes gap;
4. confirm source-tiered Company Research and career preferences;
5. calculate Employer Fit, including the unknown deal-breaker cap;
6. confirm a tailored CV, verify that the unsupported Kubernetes requirement is
   not presented as a candidate claim, and export a real DOCX;
7. generate an Interview Plan that explicitly prepares for the Kubernetes gap;
8. append user-confirmed pipeline events from saved through interviewing;
9. build the dynamic Dashboard and verify that confirmed, current artifacts do
   not produce redundant next actions.

The journey writes only to a temporary workspace. It does not use a live model,
real personal data, or external websites. Semantic proposals are deterministic
fixtures because the acceptance target is Career Steward's validation,
versioning, persistence, and orchestration contracts—not model output quality.

The full test suite also performs a backup/restore round trip: it restores a
snapshot after later data was written, verifies the restored state, and checks
that the displaced state was preserved as a pre-restore safety backup.

## Manual release checks

Before tagging 1.0, also perform these environment-dependent checks:

- install the package into a clean Pi workspace and run `/career`;
- import a consented, redacted real-world text PDF and inspect extracted evidence;
- fetch representative official, professional, community, and award-registry
  pages through `fetch_company_source` on a normally networked machine;
- render the exported DOCX in Word or LibreOffice and inspect every page;
- complete one confirmation flow interactively, including cancellation.

Live websites are intentionally excluded from automated tests because DNS,
robots policies, authentication, page changes, and availability would make the
release signal nondeterministic.
