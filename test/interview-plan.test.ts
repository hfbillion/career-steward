import { describe, expect, it } from "vitest";

import {
  buildInterviewPlanReportDraft,
  InterviewPlanValidationError,
  type InterviewPlanProposal,
} from "../src/application/interview-plan.js";
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
import type { JobMatchReport } from "../src/domain/job-match.js";
import { createParsedResumeDocument, SOURCE_DOCUMENT_ID } from "./fixtures.js";

function createInterviewFixture() {
  const profile = confirmCandidateProfileDraft(
    buildCandidateProfileDraft(createParsedResumeDocument(), {
      sourceDocumentId: SOURCE_DOCUMENT_ID,
      name: { value: "Ada Lovelace", evidenceBlockIds: ["p1-l1"] },
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
    2,
  );
  const opportunity = createJobOpportunity({
    companyName: "Future Analytics Inc.",
    jobTitle: "Senior Software Architect",
    jdText: [
      "Lead architecture for a reliable distributed analytics platform.",
      "Strong TypeScript experience is required for backend services.",
      "Production Kubernetes experience is required for platform operations.",
    ].join("\n"),
  });
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
        {
          text: "Production Kubernetes experience",
          category: "required-skill",
          priority: "must",
          explicitness: "explicit",
          evidenceBlockIds: ["jd-b3"],
        },
      ],
    }),
    3,
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
          explanation: "Direct architecture evidence.",
          confidence: 0.9,
        },
        {
          requirementId: analysis.requirements[1]!.id,
          assessment: "strong",
          candidateEvidenceIds: [typescriptEvidence],
          explanation: "Confirmed TypeScript evidence.",
          confidence: 0.85,
        },
        {
          requirementId: analysis.requirements[2]!.id,
          assessment: "gap",
          candidateEvidenceIds: [],
          explanation: "No confirmed Kubernetes evidence.",
          confidence: 0.8,
        },
      ],
    }),
    revision: 4,
  };
  const proposal: InterviewPlanProposal = {
    opportunityId: opportunity.id,
    preparationItems: [
      {
        requirementId: analysis.requirements[0]!.id,
        candidateEvidenceIds: [architectureEvidence],
        objective: "Explain the architecture decision and its reliability trade-offs.",
        talkingPoints: ["Context, constraints, decision, and consequences."],
        practiceQuestions: ["How did you design the distributed platform?"],
        preparationActions: ["Draw the architecture and rehearse a five-minute walkthrough."],
      },
      {
        requirementId: analysis.requirements[1]!.id,
        candidateEvidenceIds: [typescriptEvidence],
        objective: "Demonstrate practical TypeScript depth.",
        talkingPoints: ["Discuss type safety and service design."],
        practiceQuestions: ["Which TypeScript design trade-offs have you made?"],
        preparationActions: ["Review one representative backend design."],
      },
      {
        requirementId: analysis.requirements[2]!.id,
        candidateEvidenceIds: [],
        objective: "Prepare an honest Kubernetes gap response and learning plan.",
        talkingPoints: [],
        practiceQuestions: ["What production Kubernetes experience do you have?"],
        preparationActions: ["Study deployment primitives and prepare a 30-day plan."],
        honestBoundary: "I do not have confirmed production Kubernetes experience.",
      },
    ],
    starStories: [
      {
        title: "Reliable analytics architecture",
        experienceId: profile.experiences[0]!.id,
        requirementIds: [analysis.requirements[0]!.id],
        candidateEvidenceIds: [architectureEvidence],
        situation: "An analytics system needed a reliable distributed design.",
        task: "Design the architecture.",
        action: "Developed the distributed analytical system design.",
        result: "Produced the confirmed reliable system design described in the resume.",
      },
    ],
    schedule: [
      {
        day: 1,
        title: "Architecture, TypeScript, and gap preparation",
        durationMinutes: 90,
        requirementIds: analysis.requirements.map((requirement) => requirement.id),
        activities: ["Architecture mock", "TypeScript deep dive", "Gap response rehearsal"],
      },
    ],
    reverseInterviewQuestions: [
      {
        question: "How does the team balance architecture work with delivery commitments?",
        rationale: "Clarify operating expectations with a neutral question.",
        companyClaimIds: [],
      },
    ],
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

describe("interview plan", () => {
  it("builds a complete evidence-grounded preparation plan without a readiness score", () => {
    const fixture = createInterviewFixture();
    const report = buildInterviewPlanReportDraft(
      fixture.profile,
      fixture.opportunity,
      fixture.analysis,
      fixture.match,
      undefined,
      fixture.proposal,
      { provider: "test", modelId: "interview-model" },
      new Date("2026-11-01T05:00:00.000Z"),
    );

    expect(report.preparationItems.map((item) => item.focusType)).toEqual([
      "leverage-strength",
      "leverage-strength",
      "mitigate-gap",
    ]);
    expect(report.starStories[0]).toMatchObject({
      company: "Analytical Engines Ltd.",
      roleTitle: "Software Architect",
    });
    expect(report.metrics).toEqual({
      requirementCount: 3,
      evidenceBackedItemCount: 2,
      riskItemCount: 1,
      starStoryCount: 1,
      scheduledDays: 1,
      totalMinutes: 90,
    });
    expect(report).not.toHaveProperty("readinessScore");
    expect(report.warnings).toHaveLength(1);
  });

  it("rejects missing preparation items and unscheduled requirements", () => {
    const fixture = createInterviewFixture();
    expect(() =>
      buildInterviewPlanReportDraft(
        fixture.profile,
        fixture.opportunity,
        fixture.analysis,
        fixture.match,
        undefined,
        {
          ...fixture.proposal,
          preparationItems: fixture.proposal.preparationItems.slice(0, 2),
        },
      ),
    ).toThrow("missing requirement");

    expect(() =>
      buildInterviewPlanReportDraft(
        fixture.profile,
        fixture.opportunity,
        fixture.analysis,
        fixture.match,
        undefined,
        {
          ...fixture.proposal,
          schedule: [
            {
              ...fixture.proposal.schedule[0]!,
              requirementIds: [fixture.analysis.requirements[0]!.id],
            },
          ],
        },
      ),
    ).toThrow("schedule is missing requirement");
  });

  it("forbids evidence on a gap and requires an honest boundary", () => {
    const fixture = createInterviewFixture();
    const gapIndex = 2;
    const withEvidence = fixture.proposal.preparationItems.map((item, index) =>
      index === gapIndex
        ? { ...item, candidateEvidenceIds: [fixture.architectureEvidence] }
        : item,
    );
    expect(() =>
      buildInterviewPlanReportDraft(
        fixture.profile,
        fixture.opportunity,
        fixture.analysis,
        fixture.match,
        undefined,
        { ...fixture.proposal, preparationItems: withEvidence },
      ),
    ).toThrow("must not attach candidate evidence");

    const withoutBoundary = fixture.proposal.preparationItems.map((item, index) => {
      if (index !== gapIndex) return item;
      const { honestBoundary: _removed, ...rest } = item;
      return rest;
    });
    expect(() =>
      buildInterviewPlanReportDraft(
        fixture.profile,
        fixture.opportunity,
        fixture.analysis,
        fixture.match,
        undefined,
        { ...fixture.proposal, preparationItems: withoutBoundary },
      ),
    ).toThrow("needs an honest boundary");
  });

  it("prevents STAR evidence from crossing experience boundaries", () => {
    const fixture = createInterviewFixture();
    const stories = [
      {
        ...fixture.proposal.starStories[0]!,
        requirementIds: [fixture.analysis.requirements[1]!.id],
        candidateEvidenceIds: [fixture.typescriptEvidence],
      },
    ];

    expect(() =>
      buildInterviewPlanReportDraft(
        fixture.profile,
        fixture.opportunity,
        fixture.analysis,
        fixture.match,
        undefined,
        { ...fixture.proposal, starStories: stories },
      ),
    ).toThrow("does not belong to experience");
  });

  it("rejects stale Match Reports and unavailable company claims", () => {
    const fixture = createInterviewFixture();
    expect(() =>
      buildInterviewPlanReportDraft(
        fixture.profile,
        fixture.opportunity,
        fixture.analysis,
        { ...fixture.match, profileRevision: 1 },
        undefined,
        fixture.proposal,
      ),
    ).toThrow(InterviewPlanValidationError);

    expect(() =>
      buildInterviewPlanReportDraft(
        fixture.profile,
        fixture.opportunity,
        fixture.analysis,
        fixture.match,
        undefined,
        {
          ...fixture.proposal,
          reverseInterviewQuestions: [
            {
              question: "How is workload managed?",
              rationale: "Clarify a reported signal.",
              companyClaimIds: ["invented-claim"],
            },
          ],
        },
      ),
    ).toThrow("unavailable company claim");
  });
});
