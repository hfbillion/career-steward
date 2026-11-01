import { describe, expect, it } from "vitest";

import {
  buildCareerPreferenceDraft,
  CareerPreferenceValidationError,
  confirmCareerPreferenceDraft,
} from "../src/application/career-preferences.js";
import {
  buildCompanyResearchDraft,
  confirmCompanyResearchDraft,
} from "../src/application/company-research.js";
import {
  buildEmployerFitReportDraft,
  type EmployerFitProposal,
} from "../src/application/employer-fit.js";
import { createJobOpportunity } from "../src/application/job-analysis.js";

function createFitFixture() {
  const opportunity = createJobOpportunity({
    companyName: "Analytical Engines Ltd.",
    jobTitle: "Senior Software Architect",
    jdText: "Lead a critical analytics platform and guide distributed systems architecture.",
  });
  const research = confirmCompanyResearchDraft(
    buildCompanyResearchDraft(opportunity, {
      opportunityId: opportunity.id,
      sources: [
        {
          sourceKey: "official-stability",
          sourceType: "official",
          title: "Company update",
          url: "https://example.com/company-update",
          publisher: "Analytical Engines Ltd.",
          retrievedAt: "2026-11-01T01:00:00.000Z",
          excerpt: "The company reports multi-year customer contracts.",
        },
        {
          sourceKey: "community-work",
          sourceType: "community",
          title: "Workload discussion",
          url: "https://community.example.com/workload",
          publisher: "Example Community",
          retrievedAt: "2026-11-01T01:05:00.000Z",
          excerpt: "Several posts mention frequent late releases.",
        },
      ],
      claims: [
        {
          category: "stability",
          basis: "official-fact",
          text: "The company reports multi-year customer contracts.",
          sourceKeys: ["official-stability"],
          confidence: 0.8,
        },
        {
          category: "work-intensity",
          basis: "community-sentiment",
          text: "Community posts report frequent late releases.",
          sourceKeys: ["community-work"],
          sentiment: "negative",
          confidence: 0.6,
        },
      ],
    }),
    2,
  );
  const preferences = confirmCareerPreferenceDraft(
    buildCareerPreferenceDraft({
      employerPreferences: [
        {
          dimension: "work-intensity",
          importance: 1,
          desiredOutcome: "Predictable hours with rare overtime.",
          dealBreaker: true,
        },
        {
          dimension: "stability",
          importance: 5,
          desiredOutcome: "A stable business with durable demand.",
          dealBreaker: false,
        },
      ],
    }),
    3,
  );
  const proposal: EmployerFitProposal = {
    opportunityId: opportunity.id,
    mappings: [
      {
        preferenceId: preferences.employerPreferences[0]!.id,
        assessment: "misaligned",
        companyClaimIds: [research.claims[1]!.id],
        explanation: "The confirmed community signal conflicts with predictable hours.",
        confidence: 0.75,
      },
      {
        preferenceId: preferences.employerPreferences[1]!.id,
        assessment: "aligned",
        companyClaimIds: [research.claims[0]!.id],
        explanation: "Multi-year contracts support the stability preference.",
        confidence: 0.8,
      },
    ],
  };
  return { opportunity, research, preferences, proposal };
}

describe("career preferences and Employer Fit", () => {
  it("rejects duplicate employer preference dimensions", () => {
    expect(() =>
      buildCareerPreferenceDraft({
        employerPreferences: [
          {
            dimension: "culture",
            importance: 3,
            desiredOutcome: "Collaborative culture.",
            dealBreaker: false,
          },
          {
            dimension: "culture",
            importance: 5,
            desiredOutcome: "Low-blame culture.",
            dealBreaker: true,
          },
        ],
      }),
    ).toThrow(CareerPreferenceValidationError);
  });

  it("creates a provenance-rich report and applies a misaligned deal-breaker cap", () => {
    const { research, preferences, proposal } = createFitFixture();
    const report = buildEmployerFitReportDraft(
      preferences,
      research,
      proposal,
      { provider: "test", modelId: "fit-model" },
      new Date("2026-11-01T03:00:00.000Z"),
    );

    expect(report).toMatchObject({
      preferenceRevision: 3,
      companyResearchRevision: 2,
      policyVersion: "employer-fit/1.0",
      evaluator: { provider: "test", modelId: "fit-model" },
    });
    expect(report.metrics).toMatchObject({
      alignmentScore: 83.3,
      evidenceCoverage: 100,
      employerFitScore: 49,
      appliedCaps: ["deal-breaker-misaligned-cap-49"],
    });
  });

  it("rejects missing mappings and claims from the wrong dimension", () => {
    const { research, preferences, proposal } = createFitFixture();
    expect(() =>
      buildEmployerFitReportDraft(preferences, research, {
        ...proposal,
        mappings: proposal.mappings.slice(0, 1),
      }),
    ).toThrow("missing preference");

    const wrongClaim = proposal.mappings.map((mapping, index) =>
      index === 0 ? { ...mapping, companyClaimIds: [research.claims[0]!.id] } : mapping,
    );
    expect(() =>
      buildEmployerFitReportDraft(preferences, research, {
        ...proposal,
        mappings: wrongClaim,
      }),
    ).toThrow("does not match preference dimension");
  });

  it("caps an otherwise strong result when a deal breaker is unknown", () => {
    const { research, preferences, proposal } = createFitFixture();
    const mappings = proposal.mappings.map((mapping, index) =>
      index === 0
        ? {
            ...mapping,
            assessment: "unknown" as const,
            companyClaimIds: [],
            confidence: 0,
          }
        : mapping,
    );
    const report = buildEmployerFitReportDraft(preferences, research, {
      ...proposal,
      mappings,
    });

    expect(report.metrics).toMatchObject({
      alignmentScore: 100,
      evidenceCoverage: 83.3,
      employerFitScore: 69,
      appliedCaps: ["deal-breaker-unknown-cap-69"],
    });
  });
});
