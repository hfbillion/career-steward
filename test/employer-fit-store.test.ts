import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCareerPreferenceDraft } from "../src/application/career-preferences.js";
import { buildCompanyResearchDraft } from "../src/application/company-research.js";
import { buildEmployerFitReportDraft } from "../src/application/employer-fit.js";
import { createJobOpportunity } from "../src/application/job-analysis.js";
import { CareerStore } from "../src/infrastructure/career-store.js";

describe("CareerStore company research and Employer Fit", () => {
  it("versions confirmed inputs and appends Employer Fit reports", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-employer-fit-"));
    const store = new CareerStore(workspace);

    try {
      const opportunity = createJobOpportunity({
        companyName: "Analytical Engines Ltd.",
        jobTitle: "Senior Software Architect",
        jdText: "Lead a critical analytics platform and guide distributed systems architecture.",
      });
      store.saveJobOpportunity(opportunity);

      const researchDraft = buildCompanyResearchDraft(opportunity, {
        opportunityId: opportunity.id,
        sources: [
          {
            sourceKey: "official",
            sourceType: "official",
            title: "Company update",
            url: "https://example.com/update",
            publisher: "Analytical Engines Ltd.",
            retrievedAt: "2026-11-01T01:00:00.000Z",
            excerpt: "The company reports multi-year customer contracts.",
          },
        ],
        claims: [
          {
            category: "stability",
            basis: "official-fact",
            text: "The company reports multi-year customer contracts.",
            sourceKeys: ["official"],
            confidence: 0.8,
          },
        ],
      });
      store.saveCompanyResearchDraft(researchDraft);
      const research = store.confirmCompanyResearchDraft(researchDraft.id);

      const preferenceDraft = buildCareerPreferenceDraft({
        employerPreferences: [
          {
            dimension: "stability",
            importance: 5,
            desiredOutcome: "A stable business with durable demand.",
            dealBreaker: false,
          },
        ],
      });
      store.saveCareerPreferenceDraft(preferenceDraft);
      const preferences = store.confirmCareerPreferenceDraft(preferenceDraft.id);

      const proposal = {
        opportunityId: opportunity.id,
        mappings: [
          {
            preferenceId: preferences.employerPreferences[0]!.id,
            assessment: "aligned" as const,
            companyClaimIds: [research.claims[0]!.id],
            explanation: "The confirmed claim supports the preference.",
            confidence: 0.8,
          },
        ],
      };
      const first = store.saveEmployerFitReport(
        buildEmployerFitReportDraft(preferences, research, proposal),
      );
      const second = store.saveEmployerFitReport(
        buildEmployerFitReportDraft(preferences, research, proposal),
      );

      expect(research.revision).toBe(1);
      expect(preferences.revision).toBe(1);
      expect(first.revision).toBe(1);
      expect(second.revision).toBe(2);
      expect(store.getCurrentCompanyResearch(opportunity.id)).toEqual(research);
      expect(store.getCurrentCareerPreferences()).toEqual(preferences);
      expect(store.getCurrentEmployerFit(opportunity.id)).toEqual(second);
    } finally {
      store.close();
    }
  });
});
