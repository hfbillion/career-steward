import { describe, expect, it } from "vitest";

import {
  buildJobAnalysisDraft,
  confirmJobAnalysisDraft,
  createJobOpportunity,
} from "../src/application/job-analysis.js";
import {
  buildJobMatchReportDraft,
  collectCandidateMatchEvidence,
  JobMatchValidationError,
  type JobMatchProposal,
} from "../src/application/job-match-engine.js";
import {
  buildCandidateProfileDraft,
  confirmCandidateProfileDraft,
  createResumeEvidenceId,
} from "../src/application/profile-proposal.js";
import { createParsedResumeDocument, SOURCE_DOCUMENT_ID } from "./fixtures.js";

function createMatchFixture() {
  const document = createParsedResumeDocument();
  const profile = confirmCandidateProfileDraft(
    buildCandidateProfileDraft(document, {
      sourceDocumentId: SOURCE_DOCUMENT_ID,
      name: { value: "Ada Lovelace", evidenceBlockIds: ["p1-l1"] },
      email: { value: "ada@example.test", evidenceBlockIds: ["p1-l1"] },
      headline: { value: "Software Architect", evidenceBlockIds: ["p1-l2"] },
      experiences: [
        {
          company: { value: "Analytical Engines Ltd.", evidenceBlockIds: ["p1-l2"] },
          title: { value: "Software Architect", evidenceBlockIds: ["p1-l2"] },
          summary: {
            value: "Designed reliable distributed analytical systems",
            evidenceBlockIds: ["p1-l3"],
          },
          achievements: [],
        },
      ],
      skills: [{ value: "TypeScript", evidenceBlockIds: ["p1-l4"] }],
      education: [],
    }),
    3,
    new Date("2026-10-31T04:00:00.000Z"),
  );

  const opportunity = createJobOpportunity(
    {
      companyName: "Analytical Engines Ltd.",
      jobTitle: "Senior Software Architect",
      jdText: [
        "Lead distributed-system architecture for a critical analytics platform.",
        "Strong TypeScript experience is required across backend services.",
      ].join("\n"),
    },
    new Date("2026-10-31T05:00:00.000Z"),
  );
  const analysis = confirmJobAnalysisDraft(
    buildJobAnalysisDraft(opportunity, {
      opportunityId: opportunity.id,
      roleSummary: "Architecture leadership for an analytics platform.",
      requirements: [
        {
          text: "Lead distributed-system architecture",
          category: "responsibility",
          priority: "must",
          explicitness: "explicit",
          evidenceBlockIds: ["jd-b1"],
        },
        {
          text: "Strong TypeScript experience",
          category: "required-skill",
          priority: "should",
          explicitness: "explicit",
          evidenceBlockIds: ["jd-b2"],
        },
      ],
    }),
    2,
    new Date("2026-10-31T06:00:00.000Z"),
  );

  const proposal: JobMatchProposal = {
    opportunityId: opportunity.id,
    mappings: [
      {
        requirementId: analysis.requirements[0]!.id,
        assessment: "strong",
        candidateEvidenceIds: [createResumeEvidenceId(SOURCE_DOCUMENT_ID, "p1-l3")],
        explanation: "Direct architecture delivery evidence.",
        confidence: 0.9,
      },
      {
        requirementId: analysis.requirements[1]!.id,
        assessment: "transferable",
        candidateEvidenceIds: [createResumeEvidenceId(SOURCE_DOCUMENT_ID, "p1-l4")],
        explanation: "The confirmed skill is relevant, while depth needs interview validation.",
        confidence: 0.75,
      },
    ],
  };

  return { profile, opportunity, analysis, proposal };
}

describe("job match engine", () => {
  it("builds a complete report from confirmed revisions and resolved evidence", () => {
    const { profile, analysis, proposal } = createMatchFixture();
    const report = buildJobMatchReportDraft(
      profile,
      analysis,
      proposal,
      { provider: "test-provider", modelId: "test-model" },
      new Date("2026-10-31T07:00:00.000Z"),
    );

    expect(report).toMatchObject({
      profileRevision: 3,
      jobAnalysisRevision: 2,
      policyVersion: "matching-policy/1.0",
      evaluator: { provider: "test-provider", modelId: "test-model" },
    });
    expect(report.requirementMatrix).toHaveLength(2);
    expect(report.requirementMatrix[0]).toMatchObject({
      assessment: "strong",
      weight: 5,
      factor: 1,
      earnedPoints: 5,
    });
    expect(report.requirementMatrix[0]!.candidateEvidence[0]!.originalText).toContain(
      "distributed analytical systems",
    );
    expect(report.metrics.matchScore).toBeGreaterThan(0);
  });

  it("excludes contact identity from the capability evidence pool", () => {
    const { profile } = createMatchFixture();
    const evidence = collectCandidateMatchEvidence(profile);

    expect(evidence.has(createResumeEvidenceId(SOURCE_DOCUMENT_ID, "p1-l1"))).toBe(false);
    expect(evidence.has(createResumeEvidenceId(SOURCE_DOCUMENT_ID, "p1-l3"))).toBe(true);
  });

  it("rejects missing and duplicate requirement mappings", () => {
    const { profile, analysis, proposal } = createMatchFixture();
    expect(() =>
      buildJobMatchReportDraft(profile, analysis, {
        ...proposal,
        mappings: proposal.mappings.slice(0, 1),
      }),
    ).toThrow("missing requirement");

    expect(() =>
      buildJobMatchReportDraft(profile, analysis, {
        ...proposal,
        mappings: [proposal.mappings[0]!, proposal.mappings[0]!],
      }),
    ).toThrow("mapped more than once");
  });

  it("rejects invented candidate evidence", () => {
    const { profile, analysis, proposal } = createMatchFixture();
    const mappings = proposal.mappings.map((mapping, index) =>
      index === 0 ? { ...mapping, candidateEvidenceIds: ["resume:invented:block"] } : mapping,
    );

    expect(() =>
      buildJobMatchReportDraft(profile, analysis, { ...proposal, mappings }),
    ).toThrow(JobMatchValidationError);
  });

  it("requires evidence for positive assessments and forbids it for gaps", () => {
    const { profile, analysis, proposal } = createMatchFixture();
    const withoutEvidence = proposal.mappings.map((mapping, index) =>
      index === 0 ? { ...mapping, candidateEvidenceIds: [] } : mapping,
    );
    expect(() =>
      buildJobMatchReportDraft(profile, analysis, {
        ...proposal,
        mappings: withoutEvidence,
      }),
    ).toThrow("needs candidate evidence");

    const gapWithEvidence = proposal.mappings.map((mapping, index) =>
      index === 0 ? { ...mapping, assessment: "gap" as const } : mapping,
    );
    expect(() =>
      buildJobMatchReportDraft(profile, analysis, {
        ...proposal,
        mappings: gapWithEvidence,
      }),
    ).toThrow("must not attach candidate evidence");
  });
});
