import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCandidateProfileDraft,
  type CandidateProfileProposal,
} from "../src/application/profile-proposal.js";
import { CareerStore } from "../src/infrastructure/career-store.js";
import { createParsedResumeDocument, SOURCE_DOCUMENT_ID } from "./fixtures.js";

const proposal: CandidateProfileProposal = {
  sourceDocumentId: SOURCE_DOCUMENT_ID,
  name: { value: "Ada Lovelace", evidenceBlockIds: ["p1-l1"] },
  experiences: [],
  skills: [{ value: "TypeScript", evidenceBlockIds: ["p1-l4"] }],
  education: [],
};

describe("CareerStore", () => {
  it("persists evidence and confirms an immutable profile revision transactionally", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-store-"));
    const store = new CareerStore(workspace);

    try {
      const document = createParsedResumeDocument();
      const draft = buildCandidateProfileDraft(
        document,
        proposal,
        new Date("2026-10-31T00:00:00.000Z"),
      );

      store.saveSourceDocument(document, new Date("2026-10-31T00:00:00.000Z"));
      store.saveProfileDraft(draft);

      expect(store.getSourceDocument(SOURCE_DOCUMENT_ID)?.blocks).toHaveLength(4);
      expect(store.getProfileDraft(draft.id)?.name?.status).toBe("proposed");

      const profile = store.confirmProfileDraft(
        draft.id,
        new Date("2026-10-31T01:00:00.000Z"),
      );

      expect(profile.revision).toBe(1);
      expect(profile.name?.status).toBe("confirmed");
      expect(profile.skills[0]?.status).toBe("confirmed");
      expect(store.getCurrentProfile()).toEqual(profile);
      expect(() => store.confirmProfileDraft(draft.id)).toThrow("already confirmed");
    } finally {
      store.close();
    }
  });
});
