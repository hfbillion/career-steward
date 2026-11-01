import { randomUUID } from "node:crypto";

import type { Static } from "typebox";
import { Type } from "typebox";

import type { JobOpportunity } from "../domain/job-opportunity.js";
import {
  InterviewEventDetailsSchema,
  OpportunityEventTypeSchema,
  OpportunityPipelineStatusSchema,
} from "../domain/opportunity-tracking.js";
import type {
  OpportunityEvent,
  OpportunityEventDraft,
  OpportunityEventType,
  OpportunityPipelineItem,
  OpportunityPipelineStatus,
  OpportunityTimeline,
} from "../domain/opportunity-tracking.js";

export const RecordOpportunityEventInputSchema = Type.Object({
  opportunityId: Type.String({ minLength: 1 }),
  eventType: OpportunityEventTypeSchema,
  happenedAt: Type.Optional(Type.String()),
  note: Type.Optional(Type.String()),
  interview: Type.Optional(InterviewEventDetailsSchema),
});

export const ListOpportunityPipelineInputSchema = Type.Object({
  status: Type.Optional(OpportunityPipelineStatusSchema),
});

export type RecordOpportunityEventInput = Static<
  typeof RecordOpportunityEventInputSchema
>;
export type ListOpportunityPipelineInput = Static<
  typeof ListOpportunityPipelineInputSchema
>;

export class OpportunityTrackingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpportunityTrackingValidationError";
  }
}

const TERMINAL_STATUSES = new Set<OpportunityPipelineStatus>([
  "accepted",
  "rejected",
  "withdrawn",
  "closed",
]);

const ALLOWED_FROM: Readonly<
  Record<Exclude<OpportunityEventType, "note-added">, readonly OpportunityPipelineStatus[]>
> = {
  saved: ["discovered"],
  "preparation-started": ["discovered", "saved"],
  "application-submitted": ["discovered", "saved", "preparing"],
  "interview-scheduled": ["applied", "interviewing"],
  "interview-completed": ["interviewing"],
  "offer-received": ["applied", "interviewing"],
  "offer-accepted": ["offer"],
  "offer-declined": ["offer"],
  rejected: ["applied", "interviewing", "offer"],
  withdrawn: ["saved", "preparing", "applied", "interviewing", "offer"],
  closed: ["discovered", "saved", "preparing", "applied", "interviewing", "offer"],
};

const RESULTING_STATUS: Readonly<
  Record<Exclude<OpportunityEventType, "note-added">, OpportunityPipelineStatus>
> = {
  saved: "saved",
  "preparation-started": "preparing",
  "application-submitted": "applied",
  "interview-scheduled": "interviewing",
  "interview-completed": "interviewing",
  "offer-received": "offer",
  "offer-accepted": "accepted",
  "offer-declined": "withdrawn",
  rejected: "rejected",
  withdrawn: "withdrawn",
  closed: "closed",
};

function normalizeRequiredText(value: string, field: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new OpportunityTrackingValidationError(`${field} must not be empty`);
  }
  return normalized;
}

function normalizeTimestamp(value: string, field: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new OpportunityTrackingValidationError(`${field} must be a valid timestamp`);
  }
  return timestamp.toISOString();
}

function resolveTransition(
  fromStatus: OpportunityPipelineStatus,
  eventType: OpportunityEventType,
): OpportunityPipelineStatus {
  if (eventType === "note-added") return fromStatus;

  if (!ALLOWED_FROM[eventType].includes(fromStatus)) {
    throw new OpportunityTrackingValidationError(
      `Event ${eventType} is not allowed while opportunity is ${fromStatus}`,
    );
  }
  return RESULTING_STATUS[eventType];
}

function sortAndValidateEvents(events: readonly OpportunityEvent[]): OpportunityEvent[] {
  const sorted = [...events].sort((left, right) => left.sequence - right.sequence);
  let expectedStatus: OpportunityPipelineStatus = "discovered";
  let opportunityId: string | undefined;

  for (const [index, event] of sorted.entries()) {
    const expectedSequence = index + 1;
    if (event.sequence !== expectedSequence) {
      throw new OpportunityTrackingValidationError(
        `Opportunity event sequence must be contiguous; expected ${expectedSequence}, got ${event.sequence}`,
      );
    }
    if (opportunityId && event.opportunityId !== opportunityId) {
      throw new OpportunityTrackingValidationError(
        "An opportunity timeline cannot contain events from different opportunities",
      );
    }
    opportunityId = event.opportunityId;
    if (event.fromStatus !== expectedStatus) {
      throw new OpportunityTrackingValidationError(
        `Event ${event.sequence} expected fromStatus ${expectedStatus}, got ${event.fromStatus}`,
      );
    }
    const expectedTarget = resolveTransition(expectedStatus, event.eventType);
    if (event.toStatus !== expectedTarget) {
      throw new OpportunityTrackingValidationError(
        `Event ${event.sequence} expected toStatus ${expectedTarget}, got ${event.toStatus}`,
      );
    }
    expectedStatus = event.toStatus;
  }

  return sorted;
}

export function deriveOpportunityStatus(
  events: readonly OpportunityEvent[],
): OpportunityPipelineStatus {
  const sorted = sortAndValidateEvents(events);
  return sorted.at(-1)?.toStatus ?? "discovered";
}

export function buildOpportunityEventDraft(
  opportunity: JobOpportunity,
  existingEvents: readonly OpportunityEvent[],
  input: RecordOpportunityEventInput,
  now = new Date(),
): OpportunityEventDraft {
  if (input.opportunityId !== opportunity.id) {
    throw new OpportunityTrackingValidationError(
      `Input opportunity ${input.opportunityId} does not match ${opportunity.id}`,
    );
  }

  const currentStatus = deriveOpportunityStatus(existingEvents);
  if (TERMINAL_STATUSES.has(currentStatus) && input.eventType !== "note-added") {
    throw new OpportunityTrackingValidationError(
      `Opportunity is already terminal (${currentStatus}); only notes can be appended`,
    );
  }

  if (input.eventType === "interview-scheduled" && !input.interview) {
    throw new OpportunityTrackingValidationError(
      "interview-scheduled requires interview details",
    );
  }
  if (input.eventType !== "interview-scheduled" && input.interview) {
    throw new OpportunityTrackingValidationError(
      `Interview details are not allowed for event ${input.eventType}`,
    );
  }

  const note = input.note?.replace(/\s+/g, " ").trim();
  if (input.eventType === "note-added" && !note) {
    throw new OpportunityTrackingValidationError("note-added requires a non-empty note");
  }

  const recordedAt = normalizeTimestamp(now.toISOString(), "recordedAt");
  const toStatus = resolveTransition(currentStatus, input.eventType);

  return {
    id: randomUUID(),
    opportunityId: opportunity.id,
    eventType: input.eventType,
    fromStatus: currentStatus,
    toStatus,
    happenedAt: normalizeTimestamp(input.happenedAt ?? recordedAt, "happenedAt"),
    recordedAt,
    source: "user-confirmed",
    ...(note ? { note } : {}),
    ...(input.interview
      ? {
          interview: {
            scheduledFor: normalizeTimestamp(
              input.interview.scheduledFor,
              "interview.scheduledFor",
            ),
            round: normalizeRequiredText(input.interview.round, "interview.round"),
            ...(input.interview.format
              ? {
                  format: normalizeRequiredText(
                    input.interview.format,
                    "interview.format",
                  ),
                }
              : {}),
          },
        }
      : {}),
  };
}

export function buildOpportunityTimeline(
  opportunity: JobOpportunity,
  events: readonly OpportunityEvent[],
): OpportunityTimeline {
  const sorted = sortAndValidateEvents(events);
  if (sorted.some((event) => event.opportunityId !== opportunity.id)) {
    throw new OpportunityTrackingValidationError(
      `Timeline contains an event not owned by opportunity ${opportunity.id}`,
    );
  }
  return {
    opportunity,
    currentStatus: sorted.at(-1)?.toStatus ?? "discovered",
    events: sorted,
  };
}

export function buildOpportunityPipelineItem(
  opportunity: JobOpportunity,
  events: readonly OpportunityEvent[],
): OpportunityPipelineItem {
  const timeline = buildOpportunityTimeline(opportunity, events);
  const lastEvent = timeline.events.at(-1);
  const appliedEvent = timeline.events.find(
    (event) => event.eventType === "application-submitted",
  );
  const offerEvent = timeline.events.find((event) => event.eventType === "offer-received");
  const terminalEvent = timeline.events.find((event) =>
    TERMINAL_STATUSES.has(event.toStatus),
  );

  return {
    opportunityId: opportunity.id,
    companyName: opportunity.companyName,
    jobTitle: opportunity.jobTitle,
    analysisStatus: opportunity.status,
    pipelineStatus: timeline.currentStatus,
    interviewEventCount: timeline.events.filter((event) =>
      event.eventType.startsWith("interview-"),
    ).length,
    ...(lastEvent
      ? {
          lastEventType: lastEvent.eventType,
          lastEventAt: lastEvent.happenedAt,
        }
      : {}),
    ...(appliedEvent ? { appliedAt: appliedEvent.happenedAt } : {}),
    ...(offerEvent ? { offerAt: offerEvent.happenedAt } : {}),
    ...(terminalEvent ? { terminalAt: terminalEvent.happenedAt } : {}),
  };
}
