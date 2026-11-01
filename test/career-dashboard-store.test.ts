import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildJobAnalysisDraft,
  createJobOpportunity,
} from "../src/application/job-analysis.js";
import {
  buildCandidateProfileDraft,
  type CandidateProfileProposal,
} from "../src/application/profile-proposal.js";
import { CareerStore } from "../src/infrastructure/career-store.js";
import { createParsedResumeDocument, SOURCE_DOCUMENT_ID } from "./fixtures.js";

describe("career dashboard store projection", () => {
  it("lists only proposed confirmation drafts across aggregate tables", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-dashboard-"));
    const store = new CareerStore(workspace);

    try {
      const document = createParsedResumeDocument();
      const proposal: CandidateProfileProposal = {
        sourceDocumentId: SOURCE_DOCUMENT_ID,
        experiences: [],
        skills: [],
        education: [],
      };
      const profileDraft = buildCandidateProfileDraft(
        document,
        proposal,
        new Date("2026-11-01T00:00:00.000Z"),
      );
      const opportunity = createJobOpportunity(
        {
          companyName: "Future Analytics Inc.",
          jobTitle: "Architect",
          jdText: "Design a reliable distributed analytics platform for enterprise users.",
        },
        new Date("2026-11-01T01:00:00.000Z"),
      );
      const analysisDraft = buildJobAnalysisDraft(
        opportunity,
        {
          opportunityId: opportunity.id,
          roleSummary: "Architecture role",
          requirements: [
            {
              text: "Design a reliable distributed platform",
              category: "responsibility",
              priority: "must",
              explicitness: "explicit",
              evidenceBlockIds: ["jd-b1"],
            },
          ],
        },
        new Date("2026-11-01T02:00:00.000Z"),
      );

      store.saveSourceDocument(document);
      store.saveProfileDraft(profileDraft);
      store.saveJobOpportunity(opportunity);
      store.saveJobAnalysisDraft(analysisDraft);

      expect(store.listPendingConfirmations()).toEqual([
        {
          type: "job-analysis",
          draftId: analysisDraft.id,
          opportunityId: opportunity.id,
          createdAt: analysisDraft.createdAt,
        },
        {
          type: "candidate-profile-import",
          draftId: profileDraft.id,
          createdAt: profileDraft.createdAt,
        },
      ]);

      store.confirmProfileDraft(profileDraft.id);
      expect(store.listPendingConfirmations()).toEqual([
        expect.objectContaining({ type: "job-analysis", draftId: analysisDraft.id }),
      ]);
    } finally {
      store.close();
    }
  });
});
