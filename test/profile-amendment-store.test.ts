import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCandidateProfileAmendmentDraft } from "../src/application/profile-amendment.js";
import { buildCandidateProfileDraft } from "../src/application/profile-proposal.js";
import type { CandidateProfileRevision } from "../src/domain/candidate-profile.js";
import { CareerStore } from "../src/infrastructure/career-store.js";
import { createParsedResumeDocument, SOURCE_DOCUMENT_ID } from "./fixtures.js";

function retain(field: CandidateProfileRevision["skills"][number]) {
  return {
    value: field.value,
    evidence: field.evidence.map((evidence) => ({
      source: "existing" as const,
      evidenceId: evidence.id,
    })),
  };
}

function createAmendment(
  profile: CandidateProfileRevision,
  headline: string,
  statement: string,
) {
  return buildCandidateProfileAmendmentDraft(
    profile,
    createParsedResumeDocument(),
    {
      baseRevision: profile.revision,
      reason: `Update headline to ${headline}`,
      ...(profile.name ? { name: retain(profile.name) } : {}),
      headline: {
        value: headline,
        evidence: [{ source: "user-statement", statement }],
      },
      experiences: [],
      skills: profile.skills.map(retain),
      education: [],
    },
  );
}

async function createStoreWithProfile() {
  const workspace = await mkdtemp(join(tmpdir(), "career-steward-profile-amendment-"));
  const store = new CareerStore(workspace);
  const document = createParsedResumeDocument();
  const draft = buildCandidateProfileDraft(document, {
    sourceDocumentId: SOURCE_DOCUMENT_ID,
    name: { value: "Ada Lovelace", evidenceBlockIds: ["p1-l1"] },
    headline: { value: "Software Architect", evidenceBlockIds: ["p1-l2"] },
    experiences: [],
    skills: [{ value: "TypeScript", evidenceBlockIds: ["p1-l4"] }],
    education: [],
  });
  store.saveSourceDocument(document);
  store.saveProfileDraft(draft);
  const profile = store.confirmProfileDraft(
    draft.id,
    new Date("2026-11-01T01:00:00.000Z"),
  );
  return { store, profile };
}

describe("Candidate Profile amendment storage", () => {
  it("appends an immutable revision and preserves queryable history", async () => {
    const { store, profile } = await createStoreWithProfile();
    try {
      const amendment = createAmendment(
        profile,
        "Principal Software Architect",
        "I currently work as a Principal Software Architect.",
      );
      store.saveProfileAmendmentDraft(amendment);
      expect(store.getProfileAmendmentDraft(amendment.id)).toEqual(amendment);

      const revised = store.confirmProfileAmendmentDraft(
        amendment.id,
        new Date("2026-11-01T02:00:00.000Z"),
      );
      expect(revised.revision).toBe(2);
      expect(revised.headline?.value).toBe("Principal Software Architect");
      expect(store.getProfileRevision(1)).toEqual(profile);
      expect(store.listProfileRevisions().map((item) => item.revision)).toEqual([2, 1]);
      expect(() => store.confirmProfileAmendmentDraft(amendment.id)).toThrow(
        "already confirmed",
      );
    } finally {
      store.close();
    }
  });

  it("rejects a stale amendment after another revision is confirmed", async () => {
    const { store, profile } = await createStoreWithProfile();
    try {
      const first = createAmendment(
        profile,
        "Principal Architect",
        "My current title is Principal Architect.",
      );
      const stale = createAmendment(
        profile,
        "Staff Architect",
        "My current title is Staff Architect.",
      );
      store.saveProfileAmendmentDraft(first);
      store.saveProfileAmendmentDraft(stale);
      store.confirmProfileAmendmentDraft(first.id);

      expect(() => store.confirmProfileAmendmentDraft(stale.id)).toThrow(
        "changed before confirmation",
      );
      expect(store.listProfileRevisions()).toHaveLength(2);
    } finally {
      store.close();
    }
  });
});
