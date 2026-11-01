import type { Static } from "typebox";
import { Type } from "typebox";

import {
  OpportunityEventTypeSchema,
  OpportunityPipelineStatusSchema,
} from "./opportunity-tracking.js";

export const PendingConfirmationTypeSchema = Type.Union([
  Type.Literal("candidate-profile-import"),
  Type.Literal("candidate-profile-amendment"),
  Type.Literal("job-analysis"),
  Type.Literal("company-research"),
  Type.Literal("career-preferences"),
  Type.Literal("tailored-resume"),
]);

export const PendingConfirmationSchema = Type.Object({
  type: PendingConfirmationTypeSchema,
  draftId: Type.String(),
  createdAt: Type.String(),
  opportunityId: Type.Optional(Type.String()),
  companyName: Type.Optional(Type.String()),
  jobTitle: Type.Optional(Type.String()),
});

export const CareerDashboardProfileSchema = Type.Object({
  exists: Type.Boolean(),
  revision: Type.Optional(Type.Integer({ minimum: 1 })),
  confirmedAt: Type.Optional(Type.String()),
  experienceCount: Type.Integer({ minimum: 0 }),
  skillCount: Type.Integer({ minimum: 0 }),
  educationCount: Type.Integer({ minimum: 0 }),
});

export const OpportunityPipelineCountsSchema = Type.Object({
  discovered: Type.Integer({ minimum: 0 }),
  saved: Type.Integer({ minimum: 0 }),
  preparing: Type.Integer({ minimum: 0 }),
  applied: Type.Integer({ minimum: 0 }),
  interviewing: Type.Integer({ minimum: 0 }),
  offer: Type.Integer({ minimum: 0 }),
  accepted: Type.Integer({ minimum: 0 }),
  rejected: Type.Integer({ minimum: 0 }),
  withdrawn: Type.Integer({ minimum: 0 }),
  closed: Type.Integer({ minimum: 0 }),
});

export const CareerDashboardActivitySchema = Type.Object({
  opportunityId: Type.String(),
  companyName: Type.String(),
  jobTitle: Type.String(),
  eventType: OpportunityEventTypeSchema,
  fromStatus: OpportunityPipelineStatusSchema,
  toStatus: OpportunityPipelineStatusSchema,
  happenedAt: Type.String(),
  recordedAt: Type.String(),
  note: Type.Optional(Type.String()),
});

export const CareerDashboardActionTypeSchema = Type.Union([
  Type.Literal("review-confirmation"),
  Type.Literal("import-resume"),
  Type.Literal("analyze-opportunity"),
  Type.Literal("calculate-match"),
  Type.Literal("research-company"),
  Type.Literal("tailor-resume"),
  Type.Literal("prepare-interview"),
  Type.Literal("define-preferences"),
  Type.Literal("calculate-employer-fit"),
  Type.Literal("review-offer"),
]);

export const CareerDashboardActionSchema = Type.Object({
  type: CareerDashboardActionTypeSchema,
  priority: Type.Union([
    Type.Literal("high"),
    Type.Literal("medium"),
    Type.Literal("low"),
  ]),
  title: Type.String(),
  reason: Type.String(),
  toolName: Type.Optional(Type.String()),
  opportunityId: Type.Optional(Type.String()),
  draftId: Type.Optional(Type.String()),
});

export const CareerDashboardSchema = Type.Object({
  generatedAt: Type.String(),
  profile: CareerDashboardProfileSchema,
  opportunityCount: Type.Integer({ minimum: 0 }),
  pipeline: OpportunityPipelineCountsSchema,
  pendingConfirmations: Type.Array(PendingConfirmationSchema),
  recentActivity: Type.Array(CareerDashboardActivitySchema, { maxItems: 5 }),
  nextActions: Type.Array(CareerDashboardActionSchema, { maxItems: 8 }),
});

export type PendingConfirmationType = Static<typeof PendingConfirmationTypeSchema>;
export type PendingConfirmation = Static<typeof PendingConfirmationSchema>;
export type CareerDashboardProfile = Static<typeof CareerDashboardProfileSchema>;
export type OpportunityPipelineCounts = Static<typeof OpportunityPipelineCountsSchema>;
export type CareerDashboardActivity = Static<typeof CareerDashboardActivitySchema>;
export type CareerDashboardActionType = Static<typeof CareerDashboardActionTypeSchema>;
export type CareerDashboardAction = Static<typeof CareerDashboardActionSchema>;
export type CareerDashboard = Static<typeof CareerDashboardSchema>;
