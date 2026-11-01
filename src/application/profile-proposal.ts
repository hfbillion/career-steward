import { randomUUID } from "node:crypto";

import type { Static } from "typebox";
import { Type } from "typebox";

import type {
  CandidateProfileDraft,
  CandidateProfileRevision,
  EvidenceBackedString,
  EvidenceRef,
  ProfileFieldStatus,
} from "../domain/candidate-profile.js";
import type { ParsedBlock, ParsedResumeDocument } from "../parsers/contracts.js";

const SHA256_PATTERN = "^[a-f0-9]{64}$";

export const ProposedStringSchema = Type.Object({
  value: Type.String({ minLength: 1 }),
  evidenceBlockIds: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    uniqueItems: true,
  }),
});

export const CandidateExperienceProposalSchema = Type.Object({
  company: ProposedStringSchema,
  title: ProposedStringSchema,
  startDate: Type.Optional(ProposedStringSchema),
  endDate: Type.Optional(ProposedStringSchema),
  summary: Type.Optional(ProposedStringSchema),
  achievements: Type.Array(ProposedStringSchema),
});

export const CandidateProfileProposalSchema = Type.Object({
  sourceDocumentId: Type.String({ pattern: SHA256_PATTERN }),
  name: Type.Optional(ProposedStringSchema),
  email: Type.Optional(ProposedStringSchema),
  phone: Type.Optional(ProposedStringSchema),
  headline: Type.Optional(ProposedStringSchema),
  experiences: Type.Array(CandidateExperienceProposalSchema),
  skills: Type.Array(ProposedStringSchema),
  education: Type.Array(ProposedStringSchema),
  warnings: Type.Optional(Type.Array(Type.String())),
});

export type ProposedString = Static<typeof ProposedStringSchema>;
export type CandidateProfileProposal = Static<typeof CandidateProfileProposalSchema>;

export class ProfileEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileEvidenceError";
  }
}

export function createResumeEvidenceId(sourceId: string, blockId: string): string {
  return `resume:${sourceId}:${blockId}`;
}

function resolveEvidence(
  value: ProposedString,
  document: ParsedResumeDocument,
  blocksById: ReadonlyMap<string, ParsedBlock>,
): EvidenceRef[] {
  return value.evidenceBlockIds.map((blockId) => {
    const block = blocksById.get(blockId);
    if (!block) {
      throw new ProfileEvidenceError(
        `Evidence block ${blockId} does not exist in source document ${document.source.sha256}`,
      );
    }

    return {
      id: createResumeEvidenceId(document.source.sha256, block.id),
      sourceType: "resume",
      sourceId: document.source.sha256,
      blockId: block.id,
      originalText: block.text,
      page: block.source.page,
      lineStart: block.source.lineStart,
      lineEnd: block.source.lineEnd,
      confidence: document.quality.confidence,
    };
  });
}

function resolveValue(
  value: ProposedString,
  document: ParsedResumeDocument,
  blocksById: ReadonlyMap<string, ParsedBlock>,
): EvidenceBackedString {
  const status: ProfileFieldStatus =
    document.quality.status === "good" ? "proposed" : "needs-review";

  return {
    value: value.value.trim(),
    status,
    evidence: resolveEvidence(value, document, blocksById),
  };
}

export function buildCandidateProfileDraft(
  document: ParsedResumeDocument,
  proposal: CandidateProfileProposal,
  now = new Date(),
): CandidateProfileDraft {
  if (proposal.sourceDocumentId !== document.source.sha256) {
    throw new ProfileEvidenceError(
      "Profile proposal sourceDocumentId does not match the imported resume",
    );
  }

  const blocksById = new Map(document.blocks.map((block) => [block.id, block]));
  const value = (input: ProposedString) => resolveValue(input, document, blocksById);

  return {
    id: randomUUID(),
    sourceDocumentId: document.source.sha256,
    createdAt: now.toISOString(),
    ...(proposal.name ? { name: value(proposal.name) } : {}),
    ...(proposal.email ? { email: value(proposal.email) } : {}),
    ...(proposal.phone ? { phone: value(proposal.phone) } : {}),
    ...(proposal.headline ? { headline: value(proposal.headline) } : {}),
    experiences: proposal.experiences.map((experience) => ({
      id: randomUUID(),
      company: value(experience.company),
      title: value(experience.title),
      ...(experience.startDate ? { startDate: value(experience.startDate) } : {}),
      ...(experience.endDate ? { endDate: value(experience.endDate) } : {}),
      ...(experience.summary ? { summary: value(experience.summary) } : {}),
      achievements: experience.achievements.map(value),
    })),
    skills: proposal.skills.map(value),
    education: proposal.education.map(value),
    warnings: [...document.quality.warnings, ...(proposal.warnings ?? [])],
  };
}

function confirmValue(field: EvidenceBackedString): EvidenceBackedString {
  return { ...field, status: "confirmed" };
}

export function confirmCandidateProfileDraft(
  draft: CandidateProfileDraft,
  revision: number,
  confirmedAt = new Date(),
): CandidateProfileRevision {
  return {
    ...draft,
    ...(draft.name ? { name: confirmValue(draft.name) } : {}),
    ...(draft.email ? { email: confirmValue(draft.email) } : {}),
    ...(draft.phone ? { phone: confirmValue(draft.phone) } : {}),
    ...(draft.headline ? { headline: confirmValue(draft.headline) } : {}),
    experiences: draft.experiences.map((experience) => ({
      ...experience,
      company: confirmValue(experience.company),
      title: confirmValue(experience.title),
      ...(experience.startDate ? { startDate: confirmValue(experience.startDate) } : {}),
      ...(experience.endDate ? { endDate: confirmValue(experience.endDate) } : {}),
      ...(experience.summary ? { summary: confirmValue(experience.summary) } : {}),
      achievements: experience.achievements.map(confirmValue),
    })),
    skills: draft.skills.map(confirmValue),
    education: draft.education.map(confirmValue),
    revision,
    confirmedAt: confirmedAt.toISOString(),
    change: { type: "resume-import", draftId: draft.id },
  };
}
