import { describe, expect, it } from "vitest";

import {
  buildCandidateProfileAmendmentDraft,
  confirmCandidateProfileAmendmentDraft,
  ProfileAmendmentError,
} from "../src/application/profile-amendment.js";
import type { CandidateProfileAmendmentProposal } from "../src/application/profile-amendment.js";
import {
  buildCandidateProfileDraft,
  confirmCandidateProfileDraft,
  ProfileEvidenceError,
} from "../src/application/profile-proposal.js";
import type {
  CandidateExperience,
  CandidateProfileRevision,
  EvidenceBackedString,
} from "../src/domain/candidate-profile.js";
import { createParsedResumeDocument, SOURCE_DOCUMENT_ID } from "./fixtures.js";

function createBaseProfile(): CandidateProfileRevision {
  const document = createParsedResumeDocument();
  return confirmCandidateProfileDraft(
    buildCandidateProfileDraft(
      document,
      {
        sourceDocumentId: SOURCE_DOCUMENT_ID,
        name: { value: "Ada Lovelace", evidenceBlockIds: ["p1-l1"] },
        headline: { value: "Software Architect", evidenceBlockIds: ["p1-l2"] },
        experiences: [
          {
            company: {
              value: "Analytical Engines Ltd.",
              evidenceBlockIds: ["p1-l2"],
            },
            title: { value: "Software Architect", evidenceBlockIds: ["p1-l2"] },
            achievements: [
              {
                value: "Designed reliable distributed analytical systems",
                evidenceBlockIds: ["p1-l3"],
              },
            ],
          },
        ],
        skills: [{ value: "TypeScript", evidenceBlockIds: ["p1-l4"] }],
        education: [],
      },
      new Date("2026-11-01T00:00:00.000Z"),
    ),
    1,
    new Date("2026-11-01T01:00:00.000Z"),
  );
}

function retain(field: EvidenceBackedString) {
  return {
    value: field.value,
    evidence: field.evidence.map((evidence) => ({
      source: "existing" as const,
      evidenceId: evidence.id,
    })),
  };
}

function retainExperience(experience: CandidateExperience) {
  return {
    id: experience.id,
    company: retain(experience.company),
    title: retain(experience.title),
    ...(experience.startDate ? { startDate: retain(experience.startDate) } : {}),
    ...(experience.endDate ? { endDate: retain(experience.endDate) } : {}),
    ...(experience.summary ? { summary: retain(experience.summary) } : {}),
    achievements: experience.achievements.map(retain),
  };
}

function retainProposal(
  profile: CandidateProfileRevision,
): CandidateProfileAmendmentProposal {
  return {
    baseRevision: profile.revision,
    reason: "Correct and enrich the current profile",
    ...(profile.name ? { name: retain(profile.name) } : {}),
    ...(profile.email ? { email: retain(profile.email) } : {}),
    ...(profile.phone ? { phone: retain(profile.phone) } : {}),
    ...(profile.headline ? { headline: retain(profile.headline) } : {}),
    experiences: profile.experiences.map(retainExperience),
    skills: profile.skills.map(retain),
    education: profile.education.map(retain),
  };
}

describe("Candidate Profile amendments", () => {
  it("builds a field-level diff from existing, resume, and user evidence", () => {
    const base = createBaseProfile();
    const original = structuredClone(base);
    const proposal = retainProposal(base);
    proposal.headline = {
      value: "Principal Software Architect",
      evidence: [
        {
          source: "user-statement",
          statement: "I currently work as a Principal Software Architect.",
        },
      ],
    };
    proposal.skills.push({
      value: "PostgreSQL",
      evidence: [{ source: "resume-block", blockId: "p1-l4" }],
    });

    const draft = buildCandidateProfileAmendmentDraft(
      base,
      createParsedResumeDocument(),
      proposal,
      new Date("2026-11-01T02:00:00.000Z"),
    );

    expect(draft.baseRevision).toBe(1);
    expect(draft.changes.map((change) => change.path)).toEqual([
      "headline",
      "skills",
    ]);
    expect(draft.headline?.evidence[0]).toMatchObject({
      sourceType: "user",
      sourceId: draft.id,
      originalText: "I currently work as a Principal Software Architect.",
    });
    expect(draft.skills[1]?.evidence[0]).toMatchObject({
      sourceType: "resume",
      sourceId: SOURCE_DOCUMENT_ID,
      blockId: "p1-l4",
    });
    expect(base).toEqual(original);

    const revision = confirmCandidateProfileAmendmentDraft(
      draft,
      2,
      new Date("2026-11-01T03:00:00.000Z"),
    );
    expect(revision.headline?.status).toBe("confirmed");
    expect(revision.change).toEqual({
      type: "amendment",
      draftId: draft.id,
      baseRevision: 1,
      reason: "Correct and enrich the current profile",
    });
  });

  it("rejects a proposal with no material changes", () => {
    const base = createBaseProfile();
    expect(() =>
      buildCandidateProfileAmendmentDraft(
        base,
        createParsedResumeDocument(),
        retainProposal(base),
      ),
    ).toThrow("does not contain any changes");
  });

  it("rejects stale base revisions and invented evidence", () => {
    const base = createBaseProfile();
    const stale = retainProposal(base);
    stale.baseRevision = 2;
    expect(() =>
      buildCandidateProfileAmendmentDraft(
        base,
        createParsedResumeDocument(),
        stale,
      ),
    ).toThrow(ProfileAmendmentError);

    const invented = retainProposal(base);
    invented.name = {
      value: "Ada Byron",
      evidence: [{ source: "existing", evidenceId: "invented-evidence" }],
    };
    expect(() =>
      buildCandidateProfileAmendmentDraft(
        base,
        createParsedResumeDocument(),
        invented,
      ),
    ).toThrow(ProfileEvidenceError);
  });

  it("rejects an unknown retained experience id", () => {
    const base = createBaseProfile();
    const proposal = retainProposal(base);
    proposal.experiences[0] = {
      ...proposal.experiences[0]!,
      id: "unknown-experience",
    };
    expect(() =>
      buildCandidateProfileAmendmentDraft(
        base,
        createParsedResumeDocument(),
        proposal,
      ),
    ).toThrow("is not in the base Candidate Profile");
  });
});
