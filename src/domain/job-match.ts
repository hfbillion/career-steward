import type { Static } from "typebox";
import { Type } from "typebox";

import { EvidenceRefSchema } from "./candidate-profile.js";

export const MatchAssessmentSchema = Type.Union([
  Type.Literal("strong"),
  Type.Literal("transferable"),
  Type.Literal("weak"),
  Type.Literal("gap"),
  Type.Literal("unknown"),
]);

export const MatchCapSchema = Type.Union([
  Type.Literal("must-gap-cap-69"),
  Type.Literal("must-unknown-cap-79"),
]);

export const MatchMetricsSchema = Type.Object({
  capabilityScore: Type.Number({ minimum: 0, maximum: 100 }),
  evidenceCoverage: Type.Number({ minimum: 0, maximum: 100 }),
  confidenceScore: Type.Number({ minimum: 0, maximum: 100 }),
  matchScore: Type.Number({ minimum: 0, maximum: 100 }),
  appliedCaps: Type.Array(MatchCapSchema),
});

export const RequirementEvidenceMappingSchema = Type.Object({
  requirementId: Type.String(),
  requirementText: Type.String(),
  priority: Type.Union([
    Type.Literal("must"),
    Type.Literal("should"),
    Type.Literal("nice-to-have"),
  ]),
  assessment: MatchAssessmentSchema,
  candidateEvidence: Type.Array(EvidenceRefSchema),
  explanation: Type.String(),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  weight: Type.Number({ minimum: 0 }),
  factor: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  earnedPoints: Type.Number({ minimum: 0 }),
});

export const JobMatchReportDraftSchema = Type.Object({
  id: Type.String(),
  opportunityId: Type.String(),
  profileRevision: Type.Integer({ minimum: 1 }),
  jobAnalysisRevision: Type.Integer({ minimum: 1 }),
  createdAt: Type.String(),
  policyVersion: Type.String(),
  evaluator: Type.Object({
    provider: Type.Optional(Type.String()),
    modelId: Type.Optional(Type.String()),
  }),
  metrics: MatchMetricsSchema,
  requirementMatrix: Type.Array(RequirementEvidenceMappingSchema),
  strengthRequirementIds: Type.Array(Type.String()),
  transferableRequirementIds: Type.Array(Type.String()),
  criticalGapRequirementIds: Type.Array(Type.String()),
  unknownRequirementIds: Type.Array(Type.String()),
});

export const JobMatchReportSchema = Type.Intersect([
  JobMatchReportDraftSchema,
  Type.Object({
    revision: Type.Integer({ minimum: 1 }),
  }),
]);

export type MatchAssessment = Static<typeof MatchAssessmentSchema>;
export type MatchCap = Static<typeof MatchCapSchema>;
export type MatchMetrics = Static<typeof MatchMetricsSchema>;
export type RequirementEvidenceMapping = Static<typeof RequirementEvidenceMappingSchema>;
export type JobMatchReportDraft = Static<typeof JobMatchReportDraftSchema>;
export type JobMatchReport = Static<typeof JobMatchReportSchema>;
