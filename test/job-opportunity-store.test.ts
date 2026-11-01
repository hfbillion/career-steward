import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildJobAnalysisDraft,
  createJobOpportunity,
} from "../src/application/job-analysis.js";
import { CareerStore } from "../src/infrastructure/career-store.js";

describe("CareerStore job opportunities", () => {
  it("confirms a job analysis and updates the opportunity in one transaction", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-job-store-"));
    const store = new CareerStore(workspace);

    try {
      const opportunity = createJobOpportunity(
        {
          companyName: "Analytical Engines Ltd.",
          jobTitle: "Senior Software Architect",
          jdText: [
            "Lead distributed systems architecture for the analytics platform.",
            "Strong TypeScript and PostgreSQL experience is required.",
          ].join("\n"),
        },
        new Date("2026-10-31T02:00:00.000Z"),
      );
      const draft = buildJobAnalysisDraft(
        opportunity,
        {
          opportunityId: opportunity.id,
          roleSummary: "Senior architecture role.",
          requirements: [
            {
              text: "Lead distributed systems architecture",
              category: "responsibility",
              priority: "must",
              explicitness: "explicit",
              evidenceBlockIds: ["jd-b1"],
            },
          ],
        },
        new Date("2026-10-31T03:00:00.000Z"),
      );

      store.saveJobOpportunity(opportunity);
      store.saveJobAnalysisDraft(draft);
      expect(store.getJobOpportunity(opportunity.id)?.status).toBe("captured");

      const analysis = store.confirmJobAnalysisDraft(
        draft.id,
        new Date("2026-10-31T04:00:00.000Z"),
      );

      expect(analysis.revision).toBe(1);
      expect(store.getJobOpportunity(opportunity.id)?.status).toBe("analyzed");
      expect(store.getCurrentJobAnalysis(opportunity.id)).toEqual(analysis);
      expect(() => store.confirmJobAnalysisDraft(draft.id)).toThrow("already confirmed");
    } finally {
      store.close();
    }
  });
});
