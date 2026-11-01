import { describe, expect, it } from "vitest";

import {
  buildJobAnalysisDraft,
  confirmJobAnalysisDraft,
  createJobOpportunity,
} from "../src/application/job-analysis.js";
import { buildJobMatchReportDraft } from "../src/application/job-match-engine.js";
import {
  buildCandidateProfileDraft,
  confirmCandidateProfileDraft,
  createResumeEvidenceId,
} from "../src/application/profile-proposal.js";
import {
  buildTailoredResumeDraft,
  TailoredResumeValidationError,
  type TailoredResumeProposal,
} from "../src/application/tailored-resume.js";
import type { JobMatchReport } from "../src/domain/job-match.js";
import { createParsedResumeDocument, SOURCE_DOCUMENT_ID } from "./fixtures.js";

export function createTailoredResumeFixture() {
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
          startDate: { value: "2021", evidenceBlockIds: ["p1-l2"] },
          endDate: { value: "Present", evidenceBlockIds: ["p1-l2"] },
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
    2,
    new Date("2026-11-01T01:00:00.000Z"),
  );
  const opportunity = createJobOpportunity(
    {
      companyName: "Future Analytics Inc.",
      jobTitle: "Senior Software Architect",
      jdText: [
        "Lead architecture for a reliable distributed analytics platform.",
        "Strong TypeScript experience is required for backend services.",
      ].join("\n"),
    },
    new Date("2026-11-01T02:00:00.000Z"),
  );
  const analysis = confirmJobAnalysisDraft(
    buildJobAnalysisDraft(opportunity, {
      opportunityId: opportunity.id,
      roleSummary: "Architecture leadership for an analytics platform.",
      requirements: [
        {
          text: "Lead distributed analytics architecture",
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
    4,
    new Date("2026-11-01T03:00:00.000Z"),
  );
  const architectureEvidence = createResumeEvidenceId(SOURCE_DOCUMENT_ID, "p1-l3");
  const typescriptEvidence = createResumeEvidenceId(SOURCE_DOCUMENT_ID, "p1-l4");
  const match: JobMatchReport = {
    ...buildJobMatchReportDraft(profile, analysis, {
      opportunityId: opportunity.id,
      mappings: [
        {
          requirementId: analysis.requirements[0]!.id,
          assessment: "strong",
          candidateEvidenceIds: [architectureEvidence],
          explanation: "Direct distributed-system architecture evidence.",
          confidence: 0.9,
        },
        {
          requirementId: analysis.requirements[1]!.id,
          assessment: "strong",
          candidateEvidenceIds: [typescriptEvidence],
          explanation: "Confirmed TypeScript skill evidence.",
          confidence: 0.85,
        },
      ],
    }),
    revision: 3,
  };
  const proposal: TailoredResumeProposal = {
    opportunityId: opportunity.id,
    headline: {
      text: "Software architect focused on reliable distributed analytics systems.",
      candidateEvidenceIds: [architectureEvidence],
      requirementIds: [analysis.requirements[0]!.id],
    },
    professionalSummary: {
      text: "Architect with distributed analytics and TypeScript experience.",
      candidateEvidenceIds: [architectureEvidence, typescriptEvidence],
      requirementIds: [analysis.requirements[0]!.id, analysis.requirements[1]!.id],
    },
    experiences: [
      {
        experienceId: profile.experiences[0]!.id,
        bullets: [
          {
            text: "Designed reliable distributed analytical systems.",
            candidateEvidenceIds: [architectureEvidence],
            requirementIds: [analysis.requirements[0]!.id],
          },
        ],
      },
    ],
    skills: [
      {
        profileSkillIndex: 0,
        requirementIds: [analysis.requirements[1]!.id],
      },
    ],
    educationIndexes: [],
  };

  return {
    profile,
    opportunity,
    analysis,
    match,
    proposal,
    architectureEvidence,
    typescriptEvidence,
  };
}

describe("tailored resume", () => {
  it("renders an evidence-grounded single-column Markdown CV", () => {
    const fixture = createTailoredResumeFixture();
    const draft = buildTailoredResumeDraft(
      fixture.profile,
      fixture.opportunity,
      fixture.analysis,
      fixture.match,
      fixture.proposal,
      new Date("2026-11-01T04:00:00.000Z"),
    );

    expect(draft).toMatchObject({
      profileRevision: 2,
      jobAnalysisRevision: 4,
      matchReportRevision: 3,
      companyName: "Future Analytics Inc.",
      targetJobTitle: "Senior Software Architect",
      requirementCoverage: { coverageScore: 100, uncoveredRequirementIds: [] },
    });
    expect(draft.experiences[0]).toMatchObject({
      company: "Analytical Engines Ltd.",
      title: "Software Architect",
      startDate: "2021",
      endDate: "Present",
    });
    expect(draft.skills[0]?.value).toBe("TypeScript");
    expect(draft.markdown).toContain("# Ada Lovelace");
    expect(draft.markdown).toContain("## Professional Summary");
    expect(draft.markdown).toContain("## Experience");
    expect(draft.atsChecks.every((check) => check.passed)).toBe(true);
  });

  it("rejects requirements assessed as gap or unknown", () => {
    const fixture = createTailoredResumeFixture();
    const match: JobMatchReport = {
      ...fixture.match,
      requirementMatrix: fixture.match.requirementMatrix.map((mapping, index) =>
        index === 0 ? { ...mapping, assessment: "gap" as const } : mapping,
      ),
    };

    expect(() =>
      buildTailoredResumeDraft(
        fixture.profile,
        fixture.opportunity,
        fixture.analysis,
        match,
        fixture.proposal,
      ),
    ).toThrow("is gap and cannot be presented in the CV");
  });

  it("rejects evidence that was not matched to the cited requirement", () => {
    const fixture = createTailoredResumeFixture();
    const proposal: TailoredResumeProposal = {
      ...fixture.proposal,
      headline: {
        ...fixture.proposal.headline,
        candidateEvidenceIds: [fixture.typescriptEvidence],
      },
    };

    expect(() =>
      buildTailoredResumeDraft(
        fixture.profile,
        fixture.opportunity,
        fixture.analysis,
        fixture.match,
        proposal,
      ),
    ).toThrow("was not matched to the cited requirements");
  });

  it("rejects a bullet backed by evidence outside the selected experience", () => {
    const fixture = createTailoredResumeFixture();
    const proposal: TailoredResumeProposal = {
      ...fixture.proposal,
      experiences: [
        {
          ...fixture.proposal.experiences[0]!,
          bullets: [
            {
              text: "Used TypeScript.",
              candidateEvidenceIds: [fixture.typescriptEvidence],
              requirementIds: [fixture.analysis.requirements[1]!.id],
            },
          ],
        },
      ],
    };

    expect(() =>
      buildTailoredResumeDraft(
        fixture.profile,
        fixture.opportunity,
        fixture.analysis,
        fixture.match,
        proposal,
      ),
    ).toThrow("does not belong to the selected experience");
  });

  it("rejects a stale Match Report", () => {
    const fixture = createTailoredResumeFixture();
    const staleMatch = { ...fixture.match, profileRevision: 1 };

    expect(() =>
      buildTailoredResumeDraft(
        fixture.profile,
        fixture.opportunity,
        fixture.analysis,
        staleMatch,
        fixture.proposal,
      ),
    ).toThrow(TailoredResumeValidationError);
  });
});
