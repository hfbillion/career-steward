import type { Static } from "typebox";
import { Type } from "typebox";

export const ProfileFieldStatusSchema = Type.Union([
  Type.Literal("confirmed"),
  Type.Literal("proposed"),
  Type.Literal("needs-review"),
]);

export const EvidenceRefSchema = Type.Object({
  id: Type.String(),
  sourceType: Type.Union([
    Type.Literal("resume"),
    Type.Literal("user"),
    Type.Literal("jd"),
    Type.Literal("company-source"),
  ]),
  sourceId: Type.String(),
  blockId: Type.Optional(Type.String()),
  originalText: Type.String(),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  lineStart: Type.Optional(Type.Integer({ minimum: 1 })),
  lineEnd: Type.Optional(Type.Integer({ minimum: 1 })),
  url: Type.Optional(Type.String()),
  retrievedAt: Type.Optional(Type.String()),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
});

export const EvidenceBackedStringSchema = Type.Object({
  value: Type.String(),
  status: ProfileFieldStatusSchema,
  evidence: Type.Array(EvidenceRefSchema, { minItems: 1 }),
});

export const CandidateExperienceSchema = Type.Object({
  id: Type.String(),
  company: EvidenceBackedStringSchema,
  title: EvidenceBackedStringSchema,
  startDate: Type.Optional(EvidenceBackedStringSchema),
  endDate: Type.Optional(EvidenceBackedStringSchema),
  summary: Type.Optional(EvidenceBackedStringSchema),
  achievements: Type.Array(EvidenceBackedStringSchema),
});

export const CandidateProfileDraftSchema = Type.Object({
  id: Type.String(),
  sourceDocumentId: Type.String({ pattern: "^[a-f0-9]{64}$" }),
  createdAt: Type.String(),
  name: Type.Optional(EvidenceBackedStringSchema),
  email: Type.Optional(EvidenceBackedStringSchema),
  phone: Type.Optional(EvidenceBackedStringSchema),
  headline: Type.Optional(EvidenceBackedStringSchema),
  experiences: Type.Array(CandidateExperienceSchema),
  skills: Type.Array(EvidenceBackedStringSchema),
  education: Type.Array(EvidenceBackedStringSchema),
  warnings: Type.Array(Type.String()),
});

export const ProfileRevisionChangeSchema = Type.Union([
  Type.Object({
    type: Type.Literal("resume-import"),
    draftId: Type.String(),
  }),
  Type.Object({
    type: Type.Literal("amendment"),
    draftId: Type.String(),
    baseRevision: Type.Integer({ minimum: 1 }),
    reason: Type.String(),
  }),
]);

export const CandidateProfileRevisionSchema = Type.Intersect([
  CandidateProfileDraftSchema,
  Type.Object({
    revision: Type.Integer({ minimum: 1 }),
    confirmedAt: Type.String(),
    change: Type.Optional(ProfileRevisionChangeSchema),
  }),
]);

export type ProfileFieldStatus = Static<typeof ProfileFieldStatusSchema>;
export type EvidenceRef = Static<typeof EvidenceRefSchema>;
export type EvidenceBackedString = Static<typeof EvidenceBackedStringSchema>;
export type CandidateExperience = Static<typeof CandidateExperienceSchema>;
export type CandidateProfileDraft = Static<typeof CandidateProfileDraftSchema>;
export type ProfileRevisionChange = Static<typeof ProfileRevisionChangeSchema>;
export type CandidateProfileRevision = Static<typeof CandidateProfileRevisionSchema>;
