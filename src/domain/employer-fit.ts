import type { Static } from "typebox";
import { Type } from "typebox";

import { EmployerPreferenceDimensionSchema } from "./career-preferences.js";
import { CompanyClaimSchema } from "./company-intelligence.js";

export const EmployerFitAssessmentSchema = Type.Union([
  Type.Literal("aligned"),
  Type.Literal("partially-aligned"),
  Type.Literal("misaligned"),
  Type.Literal("unknown"),
]);

export const EmployerFitCapSchema = Type.Union([
  Type.Literal("deal-breaker-misaligned-cap-49"),
  Type.Literal("deal-breaker-unknown-cap-69"),
]);

export const PreferenceClaimMappingSchema = Type.Object({
  preferenceId: Type.String(),
  dimension: EmployerPreferenceDimensionSchema,
  desiredOutcome: Type.String(),
  importance: Type.Integer({ minimum: 1, maximum: 5 }),
  dealBreaker: Type.Boolean(),
  assessment: EmployerFitAssessmentSchema,
  companyClaims: Type.Array(CompanyClaimSchema),
  explanation: Type.String(),
  semanticConfidence: Type.Number({ minimum: 0, maximum: 1 }),
  claimConfidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  factor: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  earnedPoints: Type.Number({ minimum: 0 }),
});

export const EmployerFitMetricsSchema = Type.Object({
  alignmentScore: Type.Number({ minimum: 0, maximum: 100 }),
  evidenceCoverage: Type.Number({ minimum: 0, maximum: 100 }),
  confidenceScore: Type.Number({ minimum: 0, maximum: 100 }),
  employerFitScore: Type.Number({ minimum: 0, maximum: 100 }),
  appliedCaps: Type.Array(EmployerFitCapSchema),
});

export const EmployerFitReportDraftSchema = Type.Object({
  id: Type.String(),
  opportunityId: Type.String(),
  preferenceRevision: Type.Integer({ minimum: 1 }),
  companyResearchRevision: Type.Integer({ minimum: 1 }),
  createdAt: Type.String(),
  policyVersion: Type.String(),
  evaluator: Type.Object({
    provider: Type.Optional(Type.String()),
    modelId: Type.Optional(Type.String()),
  }),
  metrics: EmployerFitMetricsSchema,
  preferenceMatrix: Type.Array(PreferenceClaimMappingSchema),
  alignedPreferenceIds: Type.Array(Type.String()),
  concernPreferenceIds: Type.Array(Type.String()),
  unknownPreferenceIds: Type.Array(Type.String()),
});

export const EmployerFitReportSchema = Type.Intersect([
  EmployerFitReportDraftSchema,
  Type.Object({ revision: Type.Integer({ minimum: 1 }) }),
]);

export type EmployerFitAssessment = Static<typeof EmployerFitAssessmentSchema>;
export type EmployerFitCap = Static<typeof EmployerFitCapSchema>;
export type PreferenceClaimMapping = Static<typeof PreferenceClaimMappingSchema>;
export type EmployerFitMetrics = Static<typeof EmployerFitMetricsSchema>;
export type EmployerFitReportDraft = Static<typeof EmployerFitReportDraftSchema>;
export type EmployerFitReport = Static<typeof EmployerFitReportSchema>;
