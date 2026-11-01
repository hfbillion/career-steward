import type { Static } from "typebox";
import { Type } from "typebox";

import { EvidenceRefSchema } from "./candidate-profile.js";
import { CompanyClaimSchema } from "./company-intelligence.js";
import { MatchAssessmentSchema } from "./job-match.js";

export const InterviewFocusTypeSchema = Type.Union([
  Type.Literal("leverage-strength"),
  Type.Literal("demonstrate-transfer"),
  Type.Literal("strengthen-weakness"),
  Type.Literal("mitigate-gap"),
  Type.Literal("clarify-unknown"),
]);

export const InterviewPreparationItemSchema = Type.Object({
  requirementId: Type.String(),
  requirementText: Type.String(),
  priority: Type.Union([
    Type.Literal("must"),
    Type.Literal("should"),
    Type.Literal("nice-to-have"),
  ]),
  assessment: MatchAssessmentSchema,
  focusType: InterviewFocusTypeSchema,
  candidateEvidence: Type.Array(EvidenceRefSchema),
  objective: Type.String(),
  talkingPoints: Type.Array(Type.String()),
  practiceQuestions: Type.Array(Type.String(), { minItems: 1 }),
  preparationActions: Type.Array(Type.String(), { minItems: 1 }),
  honestBoundary: Type.Optional(Type.String()),
});

export const StarStorySchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  experienceId: Type.String(),
  company: Type.String(),
  roleTitle: Type.String(),
  requirementIds: Type.Array(Type.String(), { minItems: 1, uniqueItems: true }),
  candidateEvidence: Type.Array(EvidenceRefSchema, { minItems: 1 }),
  situation: Type.String(),
  task: Type.String(),
  action: Type.String(),
  result: Type.String(),
});

export const InterviewScheduleSessionSchema = Type.Object({
  day: Type.Integer({ minimum: 1 }),
  title: Type.String(),
  durationMinutes: Type.Integer({ minimum: 15, maximum: 240 }),
  requirementIds: Type.Array(Type.String(), { minItems: 1, uniqueItems: true }),
  activities: Type.Array(Type.String(), { minItems: 1 }),
});

export const ReverseInterviewQuestionSchema = Type.Object({
  question: Type.String(),
  rationale: Type.String(),
  companyClaims: Type.Array(CompanyClaimSchema),
});

export const InterviewPlanMetricsSchema = Type.Object({
  requirementCount: Type.Integer({ minimum: 0 }),
  evidenceBackedItemCount: Type.Integer({ minimum: 0 }),
  riskItemCount: Type.Integer({ minimum: 0 }),
  starStoryCount: Type.Integer({ minimum: 0 }),
  scheduledDays: Type.Integer({ minimum: 0 }),
  totalMinutes: Type.Integer({ minimum: 0 }),
});

export const InterviewPlanReportDraftSchema = Type.Object({
  id: Type.String(),
  opportunityId: Type.String(),
  companyName: Type.String(),
  jobTitle: Type.String(),
  profileRevision: Type.Integer({ minimum: 1 }),
  jobAnalysisRevision: Type.Integer({ minimum: 1 }),
  matchReportRevision: Type.Integer({ minimum: 1 }),
  companyResearchRevision: Type.Optional(Type.Integer({ minimum: 1 })),
  createdAt: Type.String(),
  evaluator: Type.Object({
    provider: Type.Optional(Type.String()),
    modelId: Type.Optional(Type.String()),
  }),
  preparationItems: Type.Array(InterviewPreparationItemSchema, { minItems: 1 }),
  starStories: Type.Array(StarStorySchema),
  schedule: Type.Array(InterviewScheduleSessionSchema, { minItems: 1 }),
  reverseInterviewQuestions: Type.Array(ReverseInterviewQuestionSchema, { minItems: 1 }),
  metrics: InterviewPlanMetricsSchema,
  warnings: Type.Array(Type.String()),
});

export const InterviewPlanReportSchema = Type.Intersect([
  InterviewPlanReportDraftSchema,
  Type.Object({ revision: Type.Integer({ minimum: 1 }) }),
]);

export type InterviewFocusType = Static<typeof InterviewFocusTypeSchema>;
export type InterviewPreparationItem = Static<typeof InterviewPreparationItemSchema>;
export type StarStory = Static<typeof StarStorySchema>;
export type InterviewScheduleSession = Static<typeof InterviewScheduleSessionSchema>;
export type ReverseInterviewQuestion = Static<typeof ReverseInterviewQuestionSchema>;
export type InterviewPlanMetrics = Static<typeof InterviewPlanMetricsSchema>;
export type InterviewPlanReportDraft = Static<typeof InterviewPlanReportDraftSchema>;
export type InterviewPlanReport = Static<typeof InterviewPlanReportSchema>;
