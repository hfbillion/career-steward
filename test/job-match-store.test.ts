import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createJobOpportunity } from "../src/application/job-analysis.js";
import type { JobMatchReportDraft } from "../src/domain/job-match.js";
import { CareerStore } from "../src/infrastructure/career-store.js";

function createReportDraft(opportunityId: string, id: string): JobMatchReportDraft {
  return {
    id,
    opportunityId,
    profileRevision: 1,
    jobAnalysisRevision: 1,
    createdAt: "2026-10-31T08:00:00.000Z",
    policyVersion: "matching-policy/1.0",
    evaluator: {},
    metrics: {
      capabilityScore: 100,
      evidenceCoverage: 100,
      confidenceScore: 90,
      matchScore: 100,
      appliedCaps: [],
    },
    requirementMatrix: [],
    strengthRequirementIds: [],
    transferableRequirementIds: [],
    criticalGapRequirementIds: [],
    unknownRequirementIds: [],
  };
}

describe("CareerStore job match reports", () => {
  it("appends immutable per-opportunity revisions and reads the latest report", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-match-store-"));
    const store = new CareerStore(workspace);

    try {
      const opportunity = createJobOpportunity({
        companyName: "Analytical Engines Ltd.",
        jobTitle: "Senior Software Architect",
        jdText: "Lead distributed systems architecture with strong TypeScript delivery experience.",
      });
      store.saveJobOpportunity(opportunity);

      const first = store.saveJobMatchReport(createReportDraft(opportunity.id, "report-1"));
      const second = store.saveJobMatchReport(createReportDraft(opportunity.id, "report-2"));

      expect(first.revision).toBe(1);
      expect(second.revision).toBe(2);
      expect(store.getCurrentJobMatch(opportunity.id)).toEqual(second);
    } finally {
      store.close();
    }
  });
});
