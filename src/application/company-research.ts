import { randomUUID } from "node:crypto";

import type { Static } from "typebox";
import { Type } from "typebox";

import type {
  CompanyClaim,
  CompanyClaimBasis,
  CompanyClaimCategory,
  CompanyResearchCoverage,
  CompanyResearchDraft,
  CompanyResearchRevision,
  CompanySource,
  CompanySourceType,
} from "../domain/company-intelligence.js";
import {
  CompanyClaimBasisSchema,
  CompanyClaimCategorySchema,
  CompanyClaimSentimentSchema,
  CompanySourceTypeSchema,
} from "../domain/company-intelligence.js";
import type { JobOpportunity } from "../domain/job-opportunity.js";

export const CompanyResearchSourceProposalSchema = Type.Object({
  sourceKey: Type.String({ minLength: 1 }),
  sourceType: CompanySourceTypeSchema,
  title: Type.String({ minLength: 1 }),
  url: Type.String({ minLength: 1 }),
  publisher: Type.String({ minLength: 1 }),
  publishedAt: Type.Optional(Type.String({ minLength: 1 })),
  retrievedAt: Type.String({ minLength: 1 }),
  excerpt: Type.String({ minLength: 1 }),
  contentSha256: Type.Optional(
    Type.String({ pattern: "^[a-f0-9]{64}$" }),
  ),
  retrievalMethod: Type.Optional(Type.Literal("career-steward-fetch")),
});

export const CompanyClaimProposalSchema = Type.Object({
  category: CompanyClaimCategorySchema,
  basis: CompanyClaimBasisSchema,
  text: Type.String({ minLength: 1 }),
  sourceKeys: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    uniqueItems: true,
  }),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  sentiment: Type.Optional(CompanyClaimSentimentSchema),
  rationale: Type.Optional(Type.String({ minLength: 1 })),
  timeScope: Type.Optional(Type.String({ minLength: 1 })),
});

export const CompanyResearchProposalSchema = Type.Object({
  opportunityId: Type.String({ minLength: 1 }),
  sources: Type.Array(CompanyResearchSourceProposalSchema, { minItems: 1 }),
  claims: Type.Array(CompanyClaimProposalSchema, { minItems: 1 }),
  warnings: Type.Optional(Type.Array(Type.String())),
});

export type CompanyResearchSourceProposal = Static<
  typeof CompanyResearchSourceProposalSchema
>;
export type CompanyClaimProposal = Static<typeof CompanyClaimProposalSchema>;
export type CompanyResearchProposal = Static<typeof CompanyResearchProposalSchema>;

export const COMPANY_RESEARCH_CATEGORIES: readonly CompanyClaimCategory[] = [
  "overview",
  "reputation",
  "culture",
  "work-intensity",
  "stability",
  "compensation",
  "growth",
  "employer-recognition",
];

const BASIS_SOURCE_TYPE: Readonly<
  Partial<Record<CompanyClaimBasis, CompanySourceType>>
> = {
  "official-fact": "official",
  "reported-fact": "professional-reporting",
  "community-sentiment": "community",
  "award-record": "award-registry",
};

export class CompanyResearchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanyResearchValidationError";
  }
}

function parseHttpUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new CompanyResearchValidationError(`Invalid company source URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CompanyResearchValidationError(
      `Company source URL must use HTTP or HTTPS: ${rawUrl}`,
    );
  }
  return url.toString();
}

function validateTimestamp(value: string, label: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new CompanyResearchValidationError(`${label} is not a valid timestamp: ${value}`);
  }
  return value;
}

function buildSources(
  proposals: readonly CompanyResearchSourceProposal[],
): {
  sources: CompanySource[];
  sourceByKey: ReadonlyMap<string, CompanySource>;
} {
  const sourceByKey = new Map<string, CompanySource>();
  const seenUrls = new Set<string>();

  for (const proposal of proposals) {
    const key = proposal.sourceKey.trim();
    if (sourceByKey.has(key)) {
      throw new CompanyResearchValidationError(`Duplicate company sourceKey: ${key}`);
    }
    const url = parseHttpUrl(proposal.url);
    if (seenUrls.has(url)) {
      throw new CompanyResearchValidationError(`Duplicate company source URL: ${url}`);
    }
    seenUrls.add(url);

    if (Boolean(proposal.contentSha256) !== Boolean(proposal.retrievalMethod)) {
      throw new CompanyResearchValidationError(
        `Source ${key} must provide contentSha256 and retrievalMethod together`,
      );
    }

    const source: CompanySource = {
      id: randomUUID(),
      sourceType: proposal.sourceType,
      title: proposal.title.trim(),
      url,
      publisher: proposal.publisher.trim(),
      ...(proposal.publishedAt
        ? { publishedAt: validateTimestamp(proposal.publishedAt, "publishedAt") }
        : {}),
      retrievedAt: validateTimestamp(proposal.retrievedAt, "retrievedAt"),
      excerpt: proposal.excerpt.trim(),
      ...(proposal.contentSha256
        ? { contentSha256: proposal.contentSha256 }
        : {}),
      ...(proposal.retrievalMethod
        ? { retrievalMethod: proposal.retrievalMethod }
        : {}),
    };
    sourceByKey.set(key, source);
  }

  return { sources: [...sourceByKey.values()], sourceByKey };
}

function buildClaim(
  proposal: CompanyClaimProposal,
  sourceByKey: ReadonlyMap<string, CompanySource>,
): CompanyClaim {
  const sources = proposal.sourceKeys.map((key) => {
    const source = sourceByKey.get(key.trim());
    if (!source) {
      throw new CompanyResearchValidationError(
        `Company claim references unknown sourceKey: ${key}`,
      );
    }
    return source;
  });

  const expectedSourceType = BASIS_SOURCE_TYPE[proposal.basis];
  if (
    expectedSourceType &&
    !sources.some((source) => source.sourceType === expectedSourceType)
  ) {
    throw new CompanyResearchValidationError(
      `${proposal.basis} claim needs at least one ${expectedSourceType} source`,
    );
  }

  if (proposal.basis === "inference" && !proposal.rationale) {
    throw new CompanyResearchValidationError("Inference claim needs a rationale");
  }
  if (proposal.basis !== "inference" && proposal.rationale) {
    throw new CompanyResearchValidationError(
      `${proposal.basis} claim must not be represented as a model inference`,
    );
  }
  if (proposal.basis === "community-sentiment" && !proposal.sentiment) {
    throw new CompanyResearchValidationError(
      "Community sentiment claim needs an explicit sentiment",
    );
  }
  if (proposal.basis !== "community-sentiment" && proposal.sentiment) {
    throw new CompanyResearchValidationError(
      "Sentiment is only valid for community-sentiment claims",
    );
  }
  if (proposal.basis === "award-record") {
    if (proposal.category !== "employer-recognition" || !proposal.timeScope) {
      throw new CompanyResearchValidationError(
        "Award records need employer-recognition category and a timeScope",
      );
    }
  }

  return {
    id: randomUUID(),
    category: proposal.category,
    basis: proposal.basis,
    text: proposal.text.trim(),
    sourceIds: sources.map((source) => source.id),
    confidence: proposal.confidence,
    ...(proposal.sentiment ? { sentiment: proposal.sentiment } : {}),
    ...(proposal.rationale ? { rationale: proposal.rationale.trim() } : {}),
    ...(proposal.timeScope ? { timeScope: proposal.timeScope.trim() } : {}),
  };
}

function buildCoverage(claims: readonly CompanyClaim[]): CompanyResearchCoverage[] {
  return COMPANY_RESEARCH_CATEGORIES.map((category) => {
    const claimIds = claims
      .filter((claim) => claim.category === category)
      .map((claim) => claim.id);
    return {
      category,
      status: claimIds.length > 0 ? "covered" : "missing",
      claimIds,
    };
  });
}

export function buildCompanyResearchDraft(
  opportunity: JobOpportunity,
  proposal: CompanyResearchProposal,
  now = new Date(),
): CompanyResearchDraft {
  if (proposal.opportunityId !== opportunity.id) {
    throw new CompanyResearchValidationError(
      "Company research opportunityId does not match the stored opportunity",
    );
  }

  const { sources, sourceByKey } = buildSources(proposal.sources);
  const claims = proposal.claims.map((claim) => buildClaim(claim, sourceByKey));

  return {
    id: randomUUID(),
    opportunityId: opportunity.id,
    companyName: opportunity.companyName,
    createdAt: now.toISOString(),
    sources,
    claims,
    coverage: buildCoverage(claims),
    warnings: proposal.warnings ?? [],
  };
}

export function confirmCompanyResearchDraft(
  draft: CompanyResearchDraft,
  revision: number,
  confirmedAt = new Date(),
): CompanyResearchRevision {
  return {
    ...draft,
    revision,
    confirmedAt: confirmedAt.toISOString(),
  };
}
