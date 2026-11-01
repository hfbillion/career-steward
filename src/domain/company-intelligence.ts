import type { Static } from "typebox";
import { Type } from "typebox";

export const CompanySourceTypeSchema = Type.Union([
  Type.Literal("official"),
  Type.Literal("professional-reporting"),
  Type.Literal("community"),
  Type.Literal("award-registry"),
]);

export const CompanyClaimCategorySchema = Type.Union([
  Type.Literal("overview"),
  Type.Literal("reputation"),
  Type.Literal("culture"),
  Type.Literal("work-intensity"),
  Type.Literal("stability"),
  Type.Literal("compensation"),
  Type.Literal("growth"),
  Type.Literal("employer-recognition"),
  Type.Literal("other"),
]);

export const CompanyClaimBasisSchema = Type.Union([
  Type.Literal("official-fact"),
  Type.Literal("reported-fact"),
  Type.Literal("community-sentiment"),
  Type.Literal("award-record"),
  Type.Literal("inference"),
]);

export const CompanyClaimSentimentSchema = Type.Union([
  Type.Literal("positive"),
  Type.Literal("neutral"),
  Type.Literal("negative"),
  Type.Literal("mixed"),
]);

export const CompanySourceSchema = Type.Object({
  id: Type.String(),
  sourceType: CompanySourceTypeSchema,
  title: Type.String(),
  url: Type.String(),
  publisher: Type.String(),
  publishedAt: Type.Optional(Type.String()),
  retrievedAt: Type.String(),
  excerpt: Type.String(),
  contentSha256: Type.Optional(Type.String({ pattern: "^[a-f0-9]{64}$" })),
  retrievalMethod: Type.Optional(Type.Literal("career-steward-fetch")),
});

export const CompanyClaimSchema = Type.Object({
  id: Type.String(),
  category: CompanyClaimCategorySchema,
  basis: CompanyClaimBasisSchema,
  text: Type.String(),
  sourceIds: Type.Array(Type.String(), { minItems: 1, uniqueItems: true }),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  sentiment: Type.Optional(CompanyClaimSentimentSchema),
  rationale: Type.Optional(Type.String()),
  timeScope: Type.Optional(Type.String()),
});

export const CompanyResearchCoverageSchema = Type.Object({
  category: CompanyClaimCategorySchema,
  status: Type.Union([Type.Literal("covered"), Type.Literal("missing")]),
  claimIds: Type.Array(Type.String()),
});

export const CompanyResearchDraftSchema = Type.Object({
  id: Type.String(),
  opportunityId: Type.String(),
  companyName: Type.String(),
  createdAt: Type.String(),
  sources: Type.Array(CompanySourceSchema, { minItems: 1 }),
  claims: Type.Array(CompanyClaimSchema, { minItems: 1 }),
  coverage: Type.Array(CompanyResearchCoverageSchema),
  warnings: Type.Array(Type.String()),
});

export const CompanyResearchRevisionSchema = Type.Intersect([
  CompanyResearchDraftSchema,
  Type.Object({
    revision: Type.Integer({ minimum: 1 }),
    confirmedAt: Type.String(),
  }),
]);

export type CompanySourceType = Static<typeof CompanySourceTypeSchema>;
export type CompanyClaimCategory = Static<typeof CompanyClaimCategorySchema>;
export type CompanyClaimBasis = Static<typeof CompanyClaimBasisSchema>;
export type CompanyClaimSentiment = Static<typeof CompanyClaimSentimentSchema>;
export type CompanySource = Static<typeof CompanySourceSchema>;
export type CompanyClaim = Static<typeof CompanyClaimSchema>;
export type CompanyResearchCoverage = Static<typeof CompanyResearchCoverageSchema>;
export type CompanyResearchDraft = Static<typeof CompanyResearchDraftSchema>;
export type CompanyResearchRevision = Static<typeof CompanyResearchRevisionSchema>;
