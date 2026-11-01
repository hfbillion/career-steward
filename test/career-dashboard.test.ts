import { describe, expect, it } from "vitest";
import { Value } from "typebox/value";

import {
  buildCareerDashboard,
  formatCareerDashboard,
} from "../src/application/career-dashboard.js";
import { createJobOpportunity } from "../src/application/job-analysis.js";
import { buildOpportunityEventDraft } from "../src/application/opportunity-tracking.js";
import type { CandidateProfileRevision } from "../src/domain/candidate-profile.js";
import { CareerDashboardSchema } from "../src/domain/career-dashboard.js";
import type { JobMatchReport } from "../src/domain/job-match.js";
import type { JobAnalysisRevision } from "../src/domain/job-opportunity.js";
import type { OpportunityEvent } from "../src/domain/opportunity-tracking.js";

const profile: CandidateProfileRevision = {
  id: "profile-1",
  sourceDocumentId: "a".repeat(64),
  createdAt: "2026-10-30T00:00:00.000Z",
  experiences: [],
  skills: [],
  education: [],
  warnings: [],
  revision: 2,
  confirmedAt: "2026-10-30T01:00:00.000Z",
};

function createCurrentArtifacts(opportunityId: string): {
  jobAnalysis: JobAnalysisRevision;
  jobMatch: JobMatchReport;
} {
  return {
    jobAnalysis: {
      id: "analysis-1",
      opportunityId,
      createdAt: "2026-10-30T02:00:00.000Z",
      roleSummary: "Architecture role",
      requirements: [],
      warnings: [],
      revision: 3,
      confirmedAt: "2026-10-30T03:00:00.000Z",
    },
    jobMatch: {
      id: "match-1",
      opportunityId,
      profileRevision: 2,
      jobAnalysisRevision: 3,
      createdAt: "2026-10-30T04:00:00.000Z",
      policyVersion: "test",
      evaluator: {},
      metrics: {
        capabilityScore: 80,
        evidenceCoverage: 80,
        confidenceScore: 80,
        matchScore: 80,
        appliedCaps: [],
      },
      requirementMatrix: [],
      strengthRequirementIds: [],
      transferableRequirementIds: [],
      criticalGapRequirementIds: [],
      unknownRequirementIds: [],
      revision: 1,
    },
  };
}

function appendEvent(
  opportunity: ReturnType<typeof createJobOpportunity>,
  events: OpportunityEvent[],
  input: Parameters<typeof buildOpportunityEventDraft>[2],
  now: Date,
): void {
  events.push({
    ...buildOpportunityEventDraft(opportunity, events, input, now),
    sequence: events.length + 1,
  });
}

describe("career dashboard", () => {
  it("returns a safe onboarding action for an empty workspace", () => {
    const dashboard = buildCareerDashboard(
      { opportunities: [], pendingConfirmations: [] },
      new Date("2026-11-01T00:00:00.000Z"),
    );

    expect(dashboard.profile.exists).toBe(false);
    expect(dashboard.opportunityCount).toBe(0);
    expect(dashboard.nextActions).toEqual([
      expect.objectContaining({ type: "import-resume", priority: "high" }),
    ]);
  });

  it("derives pipeline counts, enriches drafts and recommends interview preparation", () => {
    const opportunity = createJobOpportunity(
      {
        companyName: "Future Analytics Inc.",
        jobTitle: "Staff Architect",
        jdText: "Lead the architecture of a reliable distributed analytics platform.",
      },
      new Date("2026-10-29T00:00:00.000Z"),
    );
    const events: OpportunityEvent[] = [];
    appendEvent(
      opportunity,
      events,
      { opportunityId: opportunity.id, eventType: "application-submitted" },
      new Date("2026-10-31T00:00:00.000Z"),
    );
    appendEvent(
      opportunity,
      events,
      {
        opportunityId: opportunity.id,
        eventType: "interview-scheduled",
        interview: {
          scheduledFor: "2026-11-05T02:00:00.000Z",
          round: "Architecture",
        },
      },
      new Date("2026-11-01T01:00:00.000Z"),
    );
    const artifacts = createCurrentArtifacts(opportunity.id);

    const dashboard = buildCareerDashboard(
      {
        profile,
        opportunities: [{ opportunity, events, ...artifacts }],
        pendingConfirmations: [
          {
            type: "job-analysis",
            draftId: "draft-analysis-2",
            opportunityId: opportunity.id,
            createdAt: "2026-11-01T02:00:00.000Z",
          },
        ],
      },
      new Date("2026-11-01T03:00:00.000Z"),
    );

    expect(dashboard.pipeline.interviewing).toBe(1);
    expect(dashboard.pendingConfirmations[0]).toMatchObject({
      companyName: "Future Analytics Inc.",
      jobTitle: "Staff Architect",
    });
    expect(dashboard.recentActivity.map((item) => item.eventType)).toEqual([
      "interview-scheduled",
      "application-submitted",
    ]);
    expect(dashboard.nextActions.map((item) => item.type)).toEqual([
      "review-confirmation",
      "prepare-interview",
    ]);
    expect(Value.Check(CareerDashboardSchema, dashboard)).toBe(true);
    expect(formatCareerDashboard(dashboard)).toContain("工作台只读");
    expect(formatCareerDashboard(dashboard)).toContain("interview-scheduled");
    expect(formatCareerDashboard(dashboard)).toContain(profile.confirmedAt);
    expect(formatCareerDashboard(dashboard)).toContain("closed 0");
  });

  it("treats a match based on an older profile revision as stale", () => {
    const opportunity = createJobOpportunity({
      companyName: "Versioned Systems",
      jobTitle: "Architect",
      jdText: "Design reliable systems and guide platform engineering decisions.",
    });
    const artifacts = createCurrentArtifacts(opportunity.id);
    artifacts.jobMatch.profileRevision = 1;

    const dashboard = buildCareerDashboard({
      profile,
      opportunities: [{ opportunity, events: [], ...artifacts }],
      pendingConfirmations: [],
    });

    expect(dashboard.nextActions[0]).toMatchObject({
      type: "calculate-match",
      opportunityId: opportunity.id,
    });
  });
});
