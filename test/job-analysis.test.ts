import { describe, expect, it } from "vitest";

import {
  buildJobAnalysisDraft,
  createJobOpportunity,
  JobAnalysisEvidenceError,
  type JobAnalysisProposal,
} from "../src/application/job-analysis.js";

function createOpportunity() {
  return createJobOpportunity(
    {
      companyName: "Analytical Engines Ltd.",
      jobTitle: "Senior Software Architect",
      jdText: [
        "Responsibilities",
        "Lead the architecture of distributed analytical systems.",
        "Required: strong TypeScript and PostgreSQL experience.",
        "Preferred: experience mentoring senior engineers.",
      ].join("\n"),
    },
    new Date("2026-10-31T02:00:00.000Z"),
  );
}

function createProposal(opportunityId: string): JobAnalysisProposal {
  return {
    opportunityId,
    roleSummary: "Architecture leadership for a distributed analytics platform.",
    requirements: [
      {
        text: "Lead distributed-system architecture",
        category: "responsibility",
        priority: "must",
        explicitness: "explicit",
        evidenceBlockIds: ["jd-b2"],
      },
      {
        text: "Influence technical direction across teams",
        category: "leadership",
        priority: "should",
        explicitness: "inferred",
        evidenceBlockIds: ["jd-b2", "jd-b4"],
        rationale: "Architecture leadership and mentoring normally require cross-team influence.",
        confidence: 0.7,
      },
    ],
  };
}

describe("job analysis", () => {
  it("creates stable line evidence and resolves requirement citations", () => {
    const opportunity = createOpportunity();
    expect(opportunity.blocks.map((block) => block.id)).toEqual([
      "jd-b1",
      "jd-b2",
      "jd-b3",
      "jd-b4",
    ]);
    expect(opportunity.blocks[1]).toMatchObject({ lineStart: 2, lineEnd: 2 });

    const draft = buildJobAnalysisDraft(
      opportunity,
      createProposal(opportunity.id),
      new Date("2026-10-31T03:00:00.000Z"),
    );

    expect(draft.requirements[0]?.evidence[0]).toMatchObject({
      opportunityId: opportunity.id,
      blockId: "jd-b2",
      originalText: "Lead the architecture of distributed analytical systems.",
      lineStart: 2,
    });
    expect(draft.requirements[1]?.inference).toMatchObject({ confidence: 0.7 });
  });

  it("rejects requirement citations that do not exist", () => {
    const opportunity = createOpportunity();
    const proposal = createProposal(opportunity.id);
    proposal.requirements[0]!.evidenceBlockIds = ["jd-invented"];

    expect(() => buildJobAnalysisDraft(opportunity, proposal)).toThrow(
      JobAnalysisEvidenceError,
    );
  });

  it("rejects an inferred requirement without rationale and confidence", () => {
    const opportunity = createOpportunity();
    const proposal = createProposal(opportunity.id);
    proposal.requirements[1] = {
      text: "Influence technical direction across teams",
      category: "leadership",
      priority: "should",
      explicitness: "inferred",
      evidenceBlockIds: ["jd-b2"],
    };

    expect(() => buildJobAnalysisDraft(opportunity, proposal)).toThrow(
      "needs both rationale and confidence",
    );
  });
});
