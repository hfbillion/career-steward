import type { Static } from "typebox";
import { Type } from "typebox";

import { EvidenceRefSchema } from "./candidate-profile.js";

export const TailoredResumeStatementSchema = Type.Object({
  text: Type.String(),
  candidateEvidence: Type.Array(EvidenceRefSchema, { minItems: 1 }),
  requirementIds: Type.Array(Type.String(), { minItems: 1, uniqueItems: true }),
});

export const TailoredExperienceSectionSchema = Type.Object({
  experienceId: Type.String(),
  company: Type.String(),
  title: Type.String(),
  startDate: Type.Optional(Type.String()),
  endDate: Type.Optional(Type.String()),
  bullets: Type.Array(TailoredResumeStatementSchema, { minItems: 1 }),
});

export const TailoredSkillSchema = Type.Object({
  profileSkillIndex: Type.Integer({ minimum: 0 }),
  value: Type.String(),
  requirementIds: Type.Array(Type.String(), { minItems: 1, uniqueItems: true }),
});

export const AtsCheckIdSchema = Type.Union([
  Type.Literal("standard-headings"),
  Type.Literal("single-column"),
  Type.Literal("no-tables"),
  Type.Literal("no-images"),
  Type.Literal("no-html"),
  Type.Literal("contact-details"),
  Type.Literal("evidence-grounded"),
]);

export const AtsCompatibilityCheckSchema = Type.Object({
  id: AtsCheckIdSchema,
  passed: Type.Boolean(),
  detail: Type.String(),
});

export const RequirementCoverageSchema = Type.Object({
  coveredRequirementIds: Type.Array(Type.String()),
  uncoveredRequirementIds: Type.Array(Type.String()),
  coverageScore: Type.Number({ minimum: 0, maximum: 100 }),
});

export const TailoredResumeDraftSchema = Type.Object({
  id: Type.String(),
  opportunityId: Type.String(),
  companyName: Type.String(),
  targetJobTitle: Type.String(),
  profileRevision: Type.Integer({ minimum: 1 }),
  jobAnalysisRevision: Type.Integer({ minimum: 1 }),
  matchReportRevision: Type.Integer({ minimum: 1 }),
  createdAt: Type.String(),
  contact: Type.Object({
    name: Type.Optional(Type.String()),
    email: Type.Optional(Type.String()),
    phone: Type.Optional(Type.String()),
  }),
  headline: TailoredResumeStatementSchema,
  professionalSummary: TailoredResumeStatementSchema,
  experiences: Type.Array(TailoredExperienceSectionSchema),
  skills: Type.Array(TailoredSkillSchema),
  education: Type.Array(Type.String()),
  requirementCoverage: RequirementCoverageSchema,
  atsChecks: Type.Array(AtsCompatibilityCheckSchema),
  warnings: Type.Array(Type.String()),
  markdown: Type.String(),
});

export const TailoredResumeRevisionSchema = Type.Intersect([
  TailoredResumeDraftSchema,
  Type.Object({
    revision: Type.Integer({ minimum: 1 }),
    confirmedAt: Type.String(),
  }),
]);

export type TailoredResumeStatement = Static<typeof TailoredResumeStatementSchema>;
export type TailoredExperienceSection = Static<typeof TailoredExperienceSectionSchema>;
export type TailoredSkill = Static<typeof TailoredSkillSchema>;
export type AtsCheckId = Static<typeof AtsCheckIdSchema>;
export type AtsCompatibilityCheck = Static<typeof AtsCompatibilityCheckSchema>;
export type RequirementCoverage = Static<typeof RequirementCoverageSchema>;
export type TailoredResumeDraft = Static<typeof TailoredResumeDraftSchema>;
export type TailoredResumeRevision = Static<typeof TailoredResumeRevisionSchema>;
