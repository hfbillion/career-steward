import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createJobOpportunity } from "../src/application/job-analysis.js";
import type { TailoredResumeDraft } from "../src/domain/tailored-resume.js";
import { CareerStore } from "../src/infrastructure/career-store.js";

function createDraft(opportunityId: string, id: string): TailoredResumeDraft {
  const statement = {
    text: "Evidence-grounded architecture summary.",
    candidateEvidence: [
      {
        id: "resume:source:block",
        sourceType: "resume" as const,
        sourceId: "source",
        blockId: "block",
        originalText: "Architecture evidence",
        confidence: 0.9,
      },
    ],
    requirementIds: ["requirement-1"],
  };
  return {
    id,
    opportunityId,
    companyName: "Future Analytics Inc.",
    targetJobTitle: "Senior Software Architect",
    profileRevision: 1,
    jobAnalysisRevision: 1,
    matchReportRevision: 1,
    createdAt: "2026-11-01T04:00:00.000Z",
    contact: { name: "Ada Lovelace", email: "ada@example.test" },
    headline: statement,
    professionalSummary: statement,
    experiences: [],
    skills: [],
    education: [],
    requirementCoverage: {
      coveredRequirementIds: ["requirement-1"],
      uncoveredRequirementIds: [],
      coverageScore: 100,
    },
    atsChecks: [
      {
        id: "evidence-grounded",
        passed: true,
        detail: "Validated by the application.",
      },
    ],
    warnings: [],
    markdown: "# Ada Lovelace\n\n## Professional Summary\n\nEvidence-grounded architecture summary.\n",
  };
}

describe("CareerStore tailored resume", () => {
  it("confirms immutable per-opportunity CV revisions", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-tailored-cv-"));
    const store = new CareerStore(workspace);

    try {
      const opportunity = createJobOpportunity({
        companyName: "Future Analytics Inc.",
        jobTitle: "Senior Software Architect",
        jdText: "Lead a critical analytics platform and guide distributed systems architecture.",
      });
      store.saveJobOpportunity(opportunity);
      const firstDraft = createDraft(opportunity.id, "tailored-resume-1");
      store.saveTailoredResumeDraft(firstDraft);
      expect(store.getTailoredResumeDraft(firstDraft.id)).toEqual(firstDraft);
      const first = store.confirmTailoredResumeDraft(firstDraft.id);

      const secondDraft = createDraft(opportunity.id, "tailored-resume-2");
      store.saveTailoredResumeDraft(secondDraft);
      const second = store.confirmTailoredResumeDraft(secondDraft.id);

      expect(first.revision).toBe(1);
      expect(second.revision).toBe(2);
      expect(store.getCurrentTailoredResume(opportunity.id)).toEqual(second);
      expect(() => store.confirmTailoredResumeDraft(firstDraft.id)).toThrow(
        "already confirmed",
      );
    } finally {
      store.close();
    }
  });
});
