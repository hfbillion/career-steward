import { describe, expect, it } from "vitest";

import {
  buildOpportunityEventDraft,
  buildOpportunityPipelineItem,
  buildOpportunityTimeline,
  OpportunityTrackingValidationError,
} from "../src/application/opportunity-tracking.js";
import { createJobOpportunity } from "../src/application/job-analysis.js";
import type { OpportunityEvent } from "../src/domain/opportunity-tracking.js";

function createFixture() {
  return createJobOpportunity(
    {
      companyName: "Future Analytics Inc.",
      jobTitle: "Staff Software Architect",
      jdText: "Design and lead a reliable distributed analytics platform.",
    },
    new Date("2026-11-01T00:00:00.000Z"),
  );
}

function appendDraft(
  events: OpportunityEvent[],
  draft: ReturnType<typeof buildOpportunityEventDraft>,
): OpportunityEvent {
  const event = { ...draft, sequence: events.length + 1 };
  events.push(event);
  return event;
}

describe("opportunity tracking", () => {
  it("derives the full application lifecycle from confirmed event order", () => {
    const opportunity = createFixture();
    const events: OpportunityEvent[] = [];
    expect(buildOpportunityTimeline(opportunity, events).currentStatus).toBe("discovered");

    appendDraft(
      events,
      buildOpportunityEventDraft(
        opportunity,
        events,
        { opportunityId: opportunity.id, eventType: "saved" },
        new Date("2026-11-01T01:00:00.000Z"),
      ),
    );
    appendDraft(
      events,
      buildOpportunityEventDraft(
        opportunity,
        events,
        { opportunityId: opportunity.id, eventType: "preparation-started" },
        new Date("2026-11-01T02:00:00.000Z"),
      ),
    );
    appendDraft(
      events,
      buildOpportunityEventDraft(
        opportunity,
        events,
        {
          opportunityId: opportunity.id,
          eventType: "application-submitted",
          happenedAt: "2026-10-31T12:00:00.000Z",
        },
        new Date("2026-11-01T03:00:00.000Z"),
      ),
    );
    appendDraft(
      events,
      buildOpportunityEventDraft(
        opportunity,
        events,
        {
          opportunityId: opportunity.id,
          eventType: "interview-scheduled",
          interview: {
            scheduledFor: "2026-11-05T02:00:00.000Z",
            round: " Architecture round ",
            format: " Video ",
          },
        },
        new Date("2026-11-01T04:00:00.000Z"),
      ),
    );
    appendDraft(
      events,
      buildOpportunityEventDraft(
        opportunity,
        events,
        { opportunityId: opportunity.id, eventType: "interview-completed" },
        new Date("2026-11-05T03:00:00.000Z"),
      ),
    );
    appendDraft(
      events,
      buildOpportunityEventDraft(
        opportunity,
        events,
        { opportunityId: opportunity.id, eventType: "offer-received" },
        new Date("2026-11-07T00:00:00.000Z"),
      ),
    );
    appendDraft(
      events,
      buildOpportunityEventDraft(
        opportunity,
        events,
        { opportunityId: opportunity.id, eventType: "offer-accepted" },
        new Date("2026-11-08T00:00:00.000Z"),
      ),
    );

    const timeline = buildOpportunityTimeline(opportunity, events);
    expect(timeline.currentStatus).toBe("accepted");
    expect(timeline.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(timeline.events[3]?.interview).toEqual({
      scheduledFor: "2026-11-05T02:00:00.000Z",
      round: "Architecture round",
      format: "Video",
    });

    const pipeline = buildOpportunityPipelineItem(opportunity, events);
    expect(pipeline).toMatchObject({
      analysisStatus: "captured",
      pipelineStatus: "accepted",
      interviewEventCount: 2,
      appliedAt: "2026-10-31T12:00:00.000Z",
      offerAt: "2026-11-07T00:00:00.000Z",
      terminalAt: "2026-11-08T00:00:00.000Z",
    });
  });

  it("rejects invalid transitions and protects terminal states", () => {
    const opportunity = createFixture();
    expect(() =>
      buildOpportunityEventDraft(opportunity, [], {
        opportunityId: opportunity.id,
        eventType: "offer-accepted",
      }),
    ).toThrow(OpportunityTrackingValidationError);

    const terminalEvents: OpportunityEvent[] = [];
    appendDraft(
      terminalEvents,
      buildOpportunityEventDraft(opportunity, terminalEvents, {
        opportunityId: opportunity.id,
        eventType: "application-submitted",
      }),
    );
    const rejected = appendDraft(
      terminalEvents,
      buildOpportunityEventDraft(
        opportunity,
        terminalEvents,
        { opportunityId: opportunity.id, eventType: "rejected" },
      ),
    );
    expect(rejected.toStatus).toBe("rejected");

    expect(() =>
      buildOpportunityEventDraft(opportunity, terminalEvents, {
        opportunityId: opportunity.id,
        eventType: "saved",
      }),
    ).toThrow("only notes can be appended");
  });

  it("requires interview details only for interview scheduling and a note for note events", () => {
    const opportunity = createFixture();
    const applied: OpportunityEvent = {
      ...buildOpportunityEventDraft(opportunity, [], {
        opportunityId: opportunity.id,
        eventType: "application-submitted",
      }),
      sequence: 1,
    };

    expect(() =>
      buildOpportunityEventDraft(opportunity, [applied], {
        opportunityId: opportunity.id,
        eventType: "interview-scheduled",
      }),
    ).toThrow("requires interview details");
    expect(() =>
      buildOpportunityEventDraft(opportunity, [applied], {
        opportunityId: opportunity.id,
        eventType: "note-added",
        note: "   ",
      }),
    ).toThrow("requires a non-empty note");
    expect(() =>
      buildOpportunityEventDraft(opportunity, [applied], {
        opportunityId: opportunity.id,
        eventType: "withdrawn",
        interview: {
          scheduledFor: "2026-11-05T02:00:00.000Z",
          round: "Round 1",
        },
      }),
    ).toThrow("Interview details are not allowed");
  });

  it("replays by sequence even when occurrence timestamps are backfilled", () => {
    const opportunity = createFixture();
    const saved: OpportunityEvent = {
      ...buildOpportunityEventDraft(
        opportunity,
        [],
        {
          opportunityId: opportunity.id,
          eventType: "saved",
          happenedAt: "2026-11-02T00:00:00.000Z",
        },
      ),
      sequence: 1,
    };
    const applied: OpportunityEvent = {
      ...buildOpportunityEventDraft(
        opportunity,
        [saved],
        {
          opportunityId: opportunity.id,
          eventType: "application-submitted",
          happenedAt: "2026-10-30T00:00:00.000Z",
        },
      ),
      sequence: 2,
    };

    expect(buildOpportunityTimeline(opportunity, [applied, saved]).currentStatus).toBe(
      "applied",
    );
  });
});
