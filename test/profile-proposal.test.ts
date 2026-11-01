import { describe, expect, it } from "vitest";

import {
  buildCandidateProfileDraft,
  ProfileEvidenceError,
  type CandidateProfileProposal,
} from "../src/application/profile-proposal.js";
import { createParsedResumeDocument, SOURCE_DOCUMENT_ID } from "./fixtures.js";

function createProposal(): CandidateProfileProposal {
  return {
    sourceDocumentId: SOURCE_DOCUMENT_ID,
    name: { value: "Ada Lovelace", evidenceBlockIds: ["p1-l1"] },
    headline: { value: "Software Architect", evidenceBlockIds: ["p1-l2"] },
    experiences: [
      {
        company: { value: "Analytical Engines Ltd.", evidenceBlockIds: ["p1-l2"] },
        title: { value: "Software Architect", evidenceBlockIds: ["p1-l2"] },
        achievements: [
          {
            value: "Designed reliable distributed analytical systems",
            evidenceBlockIds: ["p1-l3"],
          },
        ],
      },
    ],
    skills: [
      { value: "TypeScript", evidenceBlockIds: ["p1-l4"] },
      { value: "PostgreSQL", evidenceBlockIds: ["p1-l4"] },
    ],
    education: [],
  };
}

describe("buildCandidateProfileDraft", () => {
  it("resolves block ids into immutable source evidence", () => {
    const draft = buildCandidateProfileDraft(
      createParsedResumeDocument(),
      createProposal(),
      new Date("2026-10-31T00:00:00.000Z"),
    );

    expect(draft.name?.status).toBe("proposed");
    expect(draft.name?.evidence[0]).toMatchObject({
      sourceId: SOURCE_DOCUMENT_ID,
      blockId: "p1-l1",
      originalText: "Ada Lovelace",
      page: 1,
      lineStart: 1,
      lineEnd: 1,
    });
    expect(draft.experiences[0]?.achievements[0]?.evidence[0]?.blockId).toBe("p1-l3");
  });

  it("rejects evidence ids that are absent from the imported document", () => {
    const proposal = createProposal();
    proposal.name = { value: "Ada Lovelace", evidenceBlockIds: ["invented-block"] };

    expect(() => buildCandidateProfileDraft(createParsedResumeDocument(), proposal)).toThrow(
      ProfileEvidenceError,
    );
  });
});
