import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createJobOpportunity } from "../src/application/job-analysis.js";
import type { InterviewPlanReportDraft } from "../src/domain/interview-plan.js";
import { CareerStore } from "../src/infrastructure/career-store.js";

function createPlanDraft(opportunityId: string, id: string): InterviewPlanReportDraft {
  return {
    id,
    opportunityId,
    companyName: "Future Analytics Inc.",
    jobTitle: "Senior Software Architect",
    profileRevision: 1,
    jobAnalysisRevision: 1,
    matchReportRevision: 1,
    createdAt: "2026-11-01T05:00:00.000Z",
    evaluator: {},
    preparationItems: [
      {
        requirementId: "requirement-1",
        requirementText: "Lead architecture",
        priority: "must",
        assessment: "gap",
        focusType: "mitigate-gap",
        candidateEvidence: [],
        objective: "Prepare an honest response.",
        talkingPoints: [],
        practiceQuestions: ["What experience do you have?"],
        preparationActions: ["Create a learning plan."],
        honestBoundary: "No confirmed evidence yet.",
      },
    ],
    starStories: [],
    schedule: [
      {
        day: 1,
        title: "Gap preparation",
        durationMinutes: 30,
        requirementIds: ["requirement-1"],
        activities: ["Rehearse the honest response."],
      },
    ],
    reverseInterviewQuestions: [
      {
        question: "What support is available for learning?",
        rationale: "Clarify ramp-up expectations.",
        companyClaims: [],
      },
    ],
    metrics: {
      requirementCount: 1,
      evidenceBackedItemCount: 0,
      riskItemCount: 1,
      starStoryCount: 0,
      scheduledDays: 1,
      totalMinutes: 30,
    },
    warnings: ["Must requirement is a gap."],
  };
}

describe("CareerStore Interview Plans", () => {
  it("appends immutable per-opportunity plan revisions", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-interview-plan-"));
    const store = new CareerStore(workspace);

    try {
      const opportunity = createJobOpportunity({
        companyName: "Future Analytics Inc.",
        jobTitle: "Senior Software Architect",
        jdText: "Lead a critical analytics platform and guide distributed systems architecture.",
      });
      store.saveJobOpportunity(opportunity);
      const first = store.saveInterviewPlanReport(
        createPlanDraft(opportunity.id, "interview-plan-1"),
      );
      const second = store.saveInterviewPlanReport(
        createPlanDraft(opportunity.id, "interview-plan-2"),
      );

      expect(first.revision).toBe(1);
      expect(second.revision).toBe(2);
      expect(store.getCurrentInterviewPlan(opportunity.id)).toEqual(second);
    } finally {
      store.close();
    }
  });
});
