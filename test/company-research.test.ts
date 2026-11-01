import { describe, expect, it } from "vitest";

import {
  buildCompanyResearchDraft,
  CompanyResearchValidationError,
  type CompanyResearchProposal,
} from "../src/application/company-research.js";
import { createJobOpportunity } from "../src/application/job-analysis.js";

function createOpportunity() {
  return createJobOpportunity({
    companyName: "Analytical Engines Ltd.",
    jobTitle: "Senior Software Architect",
    jdText: "Lead a critical analytics platform and guide distributed systems architecture.",
  });
}

function createProposal(opportunityId: string): CompanyResearchProposal {
  return {
    opportunityId,
    sources: [
      {
        sourceKey: "official-about",
        sourceType: "official",
        title: "About Analytical Engines",
        url: "https://example.com/about",
        publisher: "Analytical Engines Ltd.",
        retrievedAt: "2026-11-01T01:00:00.000Z",
        excerpt: "The company operates an analytics platform.",
      },
      {
        sourceKey: "community-work",
        sourceType: "community",
        title: "Employee discussion",
        url: "https://community.example.com/thread/123",
        publisher: "Example Community",
        publishedAt: "2026-10-01T00:00:00.000Z",
        retrievedAt: "2026-11-01T01:05:00.000Z",
        excerpt: "Experiences with workload vary by team.",
      },
      {
        sourceKey: "award-2026",
        sourceType: "award-registry",
        title: "2026 Regional Employer List",
        url: "https://awards.example.com/2026/employers",
        publisher: "Regional Employer Institute",
        publishedAt: "2026-06-01T00:00:00.000Z",
        retrievedAt: "2026-11-01T01:10:00.000Z",
        excerpt: "Analytical Engines appears on the 2026 regional list.",
      },
    ],
    claims: [
      {
        category: "overview",
        basis: "official-fact",
        text: "The company operates an analytics platform.",
        sourceKeys: ["official-about"],
        confidence: 0.95,
      },
      {
        category: "work-intensity",
        basis: "community-sentiment",
        text: "Community reports describe workload as team-dependent.",
        sourceKeys: ["community-work"],
        sentiment: "mixed",
        confidence: 0.6,
      },
      {
        category: "employer-recognition",
        basis: "award-record",
        text: "The company appears on a regional employer list.",
        sourceKeys: ["award-2026"],
        timeScope: "2026 regional list",
        confidence: 0.9,
      },
    ],
  };
}

describe("company research", () => {
  it("resolves source keys and reports research coverage without a company score", () => {
    const opportunity = createOpportunity();
    const draft = buildCompanyResearchDraft(
      opportunity,
      createProposal(opportunity.id),
      new Date("2026-11-01T02:00:00.000Z"),
    );

    expect(draft.companyName).toBe("Analytical Engines Ltd.");
    expect(draft.claims[0]!.sourceIds).toEqual([draft.sources[0]!.id]);
    expect(draft.coverage.find((item) => item.category === "work-intensity")?.status).toBe(
      "covered",
    );
    expect(draft.coverage.find((item) => item.category === "stability")?.status).toBe(
      "missing",
    );
    expect(draft).not.toHaveProperty("score");
  });

  it("rejects a claim basis that is incompatible with its source tier", () => {
    const opportunity = createOpportunity();
    const proposal = createProposal(opportunity.id);
    proposal.claims[0]!.basis = "reported-fact";

    expect(() => buildCompanyResearchDraft(opportunity, proposal)).toThrow(
      CompanyResearchValidationError,
    );
  });

  it("preserves fetched-content provenance and requires complete audit metadata", () => {
    const opportunity = createOpportunity();
    const proposal = createProposal(opportunity.id);
    proposal.sources[0]!.contentSha256 = "a".repeat(64);
    proposal.sources[0]!.retrievalMethod = "career-steward-fetch";

    const draft = buildCompanyResearchDraft(opportunity, proposal);
    expect(draft.sources[0]).toMatchObject({
      contentSha256: "a".repeat(64),
      retrievalMethod: "career-steward-fetch",
    });

    const incomplete = createProposal(opportunity.id);
    incomplete.sources[0]!.contentSha256 = "b".repeat(64);
    expect(() => buildCompanyResearchDraft(opportunity, incomplete)).toThrow(
      "must provide contentSha256 and retrievalMethod together",
    );
  });

  it("requires sentiment, inference rationale, and award time scope", () => {
    const opportunity = createOpportunity();

    const noSentiment = createProposal(opportunity.id);
    delete noSentiment.claims[1]!.sentiment;
    expect(() => buildCompanyResearchDraft(opportunity, noSentiment)).toThrow(
      "needs an explicit sentiment",
    );

    const noAwardScope = createProposal(opportunity.id);
    delete noAwardScope.claims[2]!.timeScope;
    expect(() => buildCompanyResearchDraft(opportunity, noAwardScope)).toThrow(
      "need employer-recognition category and a timeScope",
    );

    const inference = createProposal(opportunity.id);
    inference.claims[0]!.basis = "inference";
    expect(() => buildCompanyResearchDraft(opportunity, inference)).toThrow(
      "Inference claim needs a rationale",
    );
  });
});
