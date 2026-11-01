import { randomUUID } from "node:crypto";

import type { Static } from "typebox";
import { Type } from "typebox";

import type {
  CandidateExperience,
  CandidateProfileDraft,
  CandidateProfileRevision,
  EvidenceBackedString,
  EvidenceRef,
} from "../domain/candidate-profile.js";
import type {
  CandidateProfileAmendmentDraft,
  CandidateProfileRevisionSummary,
  ProfileChange,
} from "../domain/profile-amendment.js";
import type { ParsedResumeDocument } from "../parsers/contracts.js";
import {
  confirmCandidateProfileDraft,
  createResumeEvidenceId,
  ProfileEvidenceError,
} from "./profile-proposal.js";

const ExistingEvidenceCitationSchema = Type.Object({
  source: Type.Literal("existing"),
  evidenceId: Type.String({ minLength: 1 }),
});

const ResumeBlockCitationSchema = Type.Object({
  source: Type.Literal("resume-block"),
  blockId: Type.String({ minLength: 1 }),
});

const UserStatementCitationSchema = Type.Object({
  source: Type.Literal("user-statement"),
  statement: Type.String({ minLength: 1 }),
});

export const ProfileAmendmentEvidenceCitationSchema = Type.Union([
  ExistingEvidenceCitationSchema,
  ResumeBlockCitationSchema,
  UserStatementCitationSchema,
]);

export const ProfileAmendmentFieldSchema = Type.Object({
  value: Type.String({ minLength: 1 }),
  evidence: Type.Array(ProfileAmendmentEvidenceCitationSchema, { minItems: 1 }),
});

export const ProfileExperienceAmendmentSchema = Type.Object({
  id: Type.Optional(Type.String({ minLength: 1 })),
  company: ProfileAmendmentFieldSchema,
  title: ProfileAmendmentFieldSchema,
  startDate: Type.Optional(ProfileAmendmentFieldSchema),
  endDate: Type.Optional(ProfileAmendmentFieldSchema),
  summary: Type.Optional(ProfileAmendmentFieldSchema),
  achievements: Type.Array(ProfileAmendmentFieldSchema),
});

export const CandidateProfileAmendmentProposalSchema = Type.Object({
  baseRevision: Type.Integer({ minimum: 1 }),
  reason: Type.String({ minLength: 1 }),
  name: Type.Optional(ProfileAmendmentFieldSchema),
  email: Type.Optional(ProfileAmendmentFieldSchema),
  phone: Type.Optional(ProfileAmendmentFieldSchema),
  headline: Type.Optional(ProfileAmendmentFieldSchema),
  experiences: Type.Array(ProfileExperienceAmendmentSchema),
  skills: Type.Array(ProfileAmendmentFieldSchema),
  education: Type.Array(ProfileAmendmentFieldSchema),
});

export type ProfileAmendmentEvidenceCitation = Static<
  typeof ProfileAmendmentEvidenceCitationSchema
>;
export type ProfileAmendmentField = Static<typeof ProfileAmendmentFieldSchema>;
export type ProfileExperienceAmendment = Static<
  typeof ProfileExperienceAmendmentSchema
>;
export type CandidateProfileAmendmentProposal = Static<
  typeof CandidateProfileAmendmentProposalSchema
>;

export class ProfileAmendmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileAmendmentError";
  }
}

function normalizeRequiredText(value: string, field: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) throw new ProfileAmendmentError(`${field} must not be empty`);
  return normalized;
}

function collectProfileEvidence(
  profile: CandidateProfileRevision,
): ReadonlyMap<string, EvidenceRef> {
  const evidence = new Map<string, EvidenceRef>();
  const add = (field: EvidenceBackedString | undefined) => {
    for (const item of field?.evidence ?? []) evidence.set(item.id, item);
  };

  add(profile.name);
  add(profile.email);
  add(profile.phone);
  add(profile.headline);
  for (const experience of profile.experiences) {
    add(experience.company);
    add(experience.title);
    add(experience.startDate);
    add(experience.endDate);
    add(experience.summary);
    for (const achievement of experience.achievements) add(achievement);
  }
  for (const skill of profile.skills) add(skill);
  for (const education of profile.education) add(education);
  return evidence;
}

function resolveField(
  proposal: ProfileAmendmentField,
  path: string,
  draftId: string,
  currentEvidence: ReadonlyMap<string, EvidenceRef>,
  document: ParsedResumeDocument,
): EvidenceBackedString {
  const blocks = new Map(document.blocks.map((block) => [block.id, block]));
  const resolved = proposal.evidence.map((citation, index): EvidenceRef => {
    if (citation.source === "existing") {
      const evidence = currentEvidence.get(citation.evidenceId);
      if (!evidence) {
        throw new ProfileEvidenceError(
          `Evidence ${citation.evidenceId} is not in the base Candidate Profile`,
        );
      }
      return evidence;
    }

    if (citation.source === "resume-block") {
      const block = blocks.get(citation.blockId);
      if (!block) {
        throw new ProfileEvidenceError(
          `Evidence block ${citation.blockId} does not exist in source document ${document.source.sha256}`,
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
    }

    return {
      id: `user:${draftId}:${path}:${index + 1}`,
      sourceType: "user",
      sourceId: draftId,
      originalText: normalizeRequiredText(citation.statement, `${path}.statement`),
      confidence: 1,
    };
  });

  if (new Set(resolved.map((item) => item.id)).size !== resolved.length) {
    throw new ProfileAmendmentError(`${path} contains duplicate evidence citations`);
  }

  return {
    value: normalizeRequiredText(proposal.value, `${path}.value`),
    status: "proposed",
    evidence: resolved,
  };
}

function comparableField(field: EvidenceBackedString | undefined): unknown {
  if (!field) return undefined;
  return {
    value: field.value,
    evidence: [...field.evidence]
      .map((item) => ({
        id: item.id,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        blockId: item.blockId,
        originalText: item.originalText,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function describeField(field: EvidenceBackedString | undefined): string | undefined {
  return field?.value;
}

function diffField(
  path: string,
  before: EvidenceBackedString | undefined,
  after: EvidenceBackedString | undefined,
  changes: ProfileChange[],
): void {
  if (JSON.stringify(comparableField(before)) === JSON.stringify(comparableField(after))) {
    return;
  }
  const beforeDescription = describeField(before);
  const afterDescription = describeField(after);
  changes.push({
    kind: before ? (after ? "updated" : "removed") : "added",
    path,
    ...(beforeDescription ? { before: beforeDescription } : {}),
    ...(afterDescription ? { after: afterDescription } : {}),
  });
}

function describeExperience(experience: CandidateExperience): string {
  return `${experience.company.value} — ${experience.title.value}`;
}

function diffExperience(
  before: CandidateExperience,
  after: CandidateExperience,
  changes: ProfileChange[],
): void {
  const prefix = `experiences.${before.id}`;
  diffField(`${prefix}.company`, before.company, after.company, changes);
  diffField(`${prefix}.title`, before.title, after.title, changes);
  diffField(`${prefix}.startDate`, before.startDate, after.startDate, changes);
  diffField(`${prefix}.endDate`, before.endDate, after.endDate, changes);
  diffField(`${prefix}.summary`, before.summary, after.summary, changes);

  const beforeAchievements = JSON.stringify(before.achievements.map(comparableField));
  const afterAchievements = JSON.stringify(after.achievements.map(comparableField));
  if (beforeAchievements !== afterAchievements) {
    changes.push({
      kind: "updated",
      path: `${prefix}.achievements`,
      before: before.achievements.map((item) => item.value).join(" | "),
      after: after.achievements.map((item) => item.value).join(" | "),
    });
  }
}

function diffFieldArray(
  path: string,
  before: readonly EvidenceBackedString[],
  after: readonly EvidenceBackedString[],
  changes: ProfileChange[],
): void {
  if (
    JSON.stringify(before.map(comparableField)) ===
    JSON.stringify(after.map(comparableField))
  ) {
    return;
  }
  changes.push({
    kind: "updated",
    path,
    before: before.map((item) => item.value).join(" | "),
    after: after.map((item) => item.value).join(" | "),
  });
}

function calculateChanges(
  base: CandidateProfileRevision,
  draft: CandidateProfileDraft,
): ProfileChange[] {
  const changes: ProfileChange[] = [];
  diffField("name", base.name, draft.name, changes);
  diffField("email", base.email, draft.email, changes);
  diffField("phone", base.phone, draft.phone, changes);
  diffField("headline", base.headline, draft.headline, changes);

  const beforeById = new Map(base.experiences.map((item) => [item.id, item]));
  const afterById = new Map(draft.experiences.map((item) => [item.id, item]));
  for (const before of base.experiences) {
    const after = afterById.get(before.id);
    if (after) diffExperience(before, after, changes);
    else {
      changes.push({
        kind: "removed",
        path: `experiences.${before.id}`,
        before: describeExperience(before),
      });
    }
  }
  for (const after of draft.experiences) {
    if (!beforeById.has(after.id)) {
      changes.push({
        kind: "added",
        path: `experiences.${after.id}`,
        after: describeExperience(after),
      });
    }
  }

  diffFieldArray("skills", base.skills, draft.skills, changes);
  diffFieldArray("education", base.education, draft.education, changes);
  return changes;
}

export function buildCandidateProfileAmendmentDraft(
  base: CandidateProfileRevision,
  document: ParsedResumeDocument,
  proposal: CandidateProfileAmendmentProposal,
  now = new Date(),
): CandidateProfileAmendmentDraft {
  if (proposal.baseRevision !== base.revision) {
    throw new ProfileAmendmentError(
      `Proposal base revision ${proposal.baseRevision} does not match current revision ${base.revision}`,
    );
  }
  if (document.source.sha256 !== base.sourceDocumentId) {
    throw new ProfileAmendmentError(
      "Source document does not match the base Candidate Profile",
    );
  }

  const draftId = randomUUID();
  const evidence = collectProfileEvidence(base);
  const field = (value: ProfileAmendmentField, path: string) =>
    resolveField(value, path, draftId, evidence, document);

  const seenExperienceIds = new Set<string>();
  const existingExperienceIds = new Set(base.experiences.map((item) => item.id));
  const experiences = proposal.experiences.map((experience, index): CandidateExperience => {
    const id = experience.id ?? randomUUID();
    if (seenExperienceIds.has(id)) {
      throw new ProfileAmendmentError(`Duplicate experience id ${id}`);
    }
    if (experience.id && !existingExperienceIds.has(experience.id)) {
      throw new ProfileAmendmentError(
        `Experience ${experience.id} is not in the base Candidate Profile`,
      );
    }
    seenExperienceIds.add(id);
    const prefix = `experiences.${id}`;
    return {
      id,
      company: field(experience.company, `${prefix}.company`),
      title: field(experience.title, `${prefix}.title`),
      ...(experience.startDate
        ? { startDate: field(experience.startDate, `${prefix}.startDate`) }
        : {}),
      ...(experience.endDate
        ? { endDate: field(experience.endDate, `${prefix}.endDate`) }
        : {}),
      ...(experience.summary
        ? { summary: field(experience.summary, `${prefix}.summary`) }
        : {}),
      achievements: experience.achievements.map((item, achievementIndex) =>
        field(item, `${prefix}.achievements.${achievementIndex}`),
      ),
    };
  });

  const profileDraft: CandidateProfileDraft = {
    id: draftId,
    sourceDocumentId: base.sourceDocumentId,
    createdAt: now.toISOString(),
    ...(proposal.name ? { name: field(proposal.name, "name") } : {}),
    ...(proposal.email ? { email: field(proposal.email, "email") } : {}),
    ...(proposal.phone ? { phone: field(proposal.phone, "phone") } : {}),
    ...(proposal.headline ? { headline: field(proposal.headline, "headline") } : {}),
    experiences,
    skills: proposal.skills.map((item, index) => field(item, `skills.${index}`)),
    education: proposal.education.map((item, index) =>
      field(item, `education.${index}`),
    ),
    warnings: [...base.warnings],
  };
  const changes = calculateChanges(base, profileDraft);
  if (changes.length === 0) {
    throw new ProfileAmendmentError("Profile amendment does not contain any changes");
  }

  return {
    ...profileDraft,
    baseRevision: base.revision,
    reason: normalizeRequiredText(proposal.reason, "reason"),
    changes,
  };
}

export function confirmCandidateProfileAmendmentDraft(
  amendment: CandidateProfileAmendmentDraft,
  revision: number,
  confirmedAt = new Date(),
): CandidateProfileRevision {
  const { baseRevision, reason, changes: _changes, ...profileDraft } = amendment;
  const profile = confirmCandidateProfileDraft(profileDraft, revision, confirmedAt);
  return {
    ...profile,
    change: {
      type: "amendment",
      draftId: amendment.id,
      baseRevision,
      reason,
    },
  };
}

export function summarizeCandidateProfileRevision(
  profile: CandidateProfileRevision,
): CandidateProfileRevisionSummary {
  return {
    revision: profile.revision,
    id: profile.id,
    sourceDocumentId: profile.sourceDocumentId,
    confirmedAt: profile.confirmedAt,
    changeType: profile.change?.type ?? "legacy",
    ...(profile.change?.type === "amendment"
      ? {
          reason: profile.change.reason,
          baseRevision: profile.change.baseRevision,
        }
      : {}),
    experienceCount: profile.experiences.length,
    skillCount: profile.skills.length,
    educationCount: profile.education.length,
  };
}
