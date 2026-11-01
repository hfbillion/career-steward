import type { Static } from "typebox";
import { Type } from "typebox";

import { JobOpportunitySchema } from "./job-opportunity.js";

export const OpportunityPipelineStatusSchema = Type.Union([
  Type.Literal("discovered"),
  Type.Literal("saved"),
  Type.Literal("preparing"),
  Type.Literal("applied"),
  Type.Literal("interviewing"),
  Type.Literal("offer"),
  Type.Literal("accepted"),
  Type.Literal("rejected"),
  Type.Literal("withdrawn"),
  Type.Literal("closed"),
]);

export const OpportunityEventTypeSchema = Type.Union([
  Type.Literal("saved"),
  Type.Literal("preparation-started"),
  Type.Literal("application-submitted"),
  Type.Literal("interview-scheduled"),
  Type.Literal("interview-completed"),
  Type.Literal("offer-received"),
  Type.Literal("offer-accepted"),
  Type.Literal("offer-declined"),
  Type.Literal("rejected"),
  Type.Literal("withdrawn"),
  Type.Literal("closed"),
  Type.Literal("note-added"),
]);

export const InterviewEventDetailsSchema = Type.Object({
  scheduledFor: Type.String(),
  round: Type.String({ minLength: 1 }),
  format: Type.Optional(Type.String({ minLength: 1 })),
});

export const OpportunityEventDraftSchema = Type.Object({
  id: Type.String(),
  opportunityId: Type.String(),
  eventType: OpportunityEventTypeSchema,
  fromStatus: OpportunityPipelineStatusSchema,
  toStatus: OpportunityPipelineStatusSchema,
  happenedAt: Type.String(),
  recordedAt: Type.String(),
  source: Type.Literal("user-confirmed"),
  note: Type.Optional(Type.String()),
  interview: Type.Optional(InterviewEventDetailsSchema),
});

export const OpportunityEventSchema = Type.Intersect([
  OpportunityEventDraftSchema,
  Type.Object({ sequence: Type.Integer({ minimum: 1 }) }),
]);

export const OpportunityTimelineSchema = Type.Object({
  opportunity: JobOpportunitySchema,
  currentStatus: OpportunityPipelineStatusSchema,
  events: Type.Array(OpportunityEventSchema),
});

export const OpportunityPipelineItemSchema = Type.Object({
  opportunityId: Type.String(),
  companyName: Type.String(),
  jobTitle: Type.String(),
  analysisStatus: Type.Union([
    Type.Literal("captured"),
    Type.Literal("analyzed"),
  ]),
  pipelineStatus: OpportunityPipelineStatusSchema,
  lastEventType: Type.Optional(OpportunityEventTypeSchema),
  lastEventAt: Type.Optional(Type.String()),
  interviewEventCount: Type.Integer({ minimum: 0 }),
  appliedAt: Type.Optional(Type.String()),
  offerAt: Type.Optional(Type.String()),
  terminalAt: Type.Optional(Type.String()),
});

export type OpportunityPipelineStatus = Static<
  typeof OpportunityPipelineStatusSchema
>;
export type OpportunityEventType = Static<typeof OpportunityEventTypeSchema>;
export type InterviewEventDetails = Static<typeof InterviewEventDetailsSchema>;
export type OpportunityEventDraft = Static<typeof OpportunityEventDraftSchema>;
export type OpportunityEvent = Static<typeof OpportunityEventSchema>;
export type OpportunityTimeline = Static<typeof OpportunityTimelineSchema>;
export type OpportunityPipelineItem = Static<typeof OpportunityPipelineItemSchema>;
