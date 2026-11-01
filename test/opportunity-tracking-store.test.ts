import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createJobOpportunity } from "../src/application/job-analysis.js";
import {
  buildOpportunityEventDraft,
  deriveOpportunityStatus,
} from "../src/application/opportunity-tracking.js";
import { CareerStore } from "../src/infrastructure/career-store.js";

describe("opportunity tracking store", () => {
  it("assigns event sequences transactionally and lists opportunities", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-tracking-"));
    const store = new CareerStore(workspace);

    try {
      const opportunity = createJobOpportunity({
        companyName: "Future Analytics Inc.",
        jobTitle: "Staff Architect",
        jdText: "Lead platform architecture.",
      });
      store.saveJobOpportunity(opportunity);

      const saved = store.appendOpportunityEvent(
        buildOpportunityEventDraft(opportunity, [], {
          opportunityId: opportunity.id,
          eventType: "saved",
        }),
      );
      const appliedDraft = buildOpportunityEventDraft(opportunity, [saved], {
        opportunityId: opportunity.id,
        eventType: "application-submitted",
        note: "Applied through the employer portal",
      });
      const applied = store.appendOpportunityEvent(appliedDraft);

      expect(saved.sequence).toBe(1);
      expect(applied.sequence).toBe(2);
      expect(deriveOpportunityStatus(store.getOpportunityEvents(opportunity.id))).toBe(
        "applied",
      );
      expect(store.listJobOpportunities()).toEqual([opportunity]);
    } finally {
      store.close();
    }
  });

  it("rejects a draft whose source status became stale before confirmation", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-tracking-stale-"));
    const store = new CareerStore(workspace);

    try {
      const opportunity = createJobOpportunity({
        companyName: "Concurrent Systems Ltd.",
        jobTitle: "Architect",
        jdText: "Design concurrent systems.",
      });
      store.saveJobOpportunity(opportunity);

      const staleDraft = buildOpportunityEventDraft(opportunity, [], {
        opportunityId: opportunity.id,
        eventType: "saved",
      });
      store.appendOpportunityEvent(
        buildOpportunityEventDraft(opportunity, [], {
          opportunityId: opportunity.id,
          eventType: "application-submitted",
        }),
      );

      expect(() => store.appendOpportunityEvent(staleDraft)).toThrow(
        "state changed before confirmation",
      );
      expect(store.getOpportunityEvents(opportunity.id)).toHaveLength(1);
    } finally {
      store.close();
    }
  });
});
