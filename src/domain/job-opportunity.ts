import type { Static } from "typebox";
import { Type } from "typebox";

export const JobDescriptionBlockSchema = Type.Object({
  id: Type.String(),
  text: Type.String(),
  lineStart: Type.Integer({ minimum: 1 }),
  lineEnd: Type.Integer({ minimum: 1 }),
});

export const JobOpportunitySchema = Type.Object({
  id: Type.String(),
  companyName: Type.String(),
  jobTitle: Type.String(),
  source: Type.Object({
    type: Type.Literal("manual"),
    url: Type.Optional(Type.String()),
  }),
  rawText: Type.String(),
  blocks: Type.Array(JobDescriptionBlockSchema, { minItems: 1 }),
  status: Type.Union([Type.Literal("captured"), Type.Literal("analyzed")]),
  createdAt: Type.String(),
});

export const JobEvidenceRefSchema = Type.Object({
  opportunityId: Type.String(),
  blockId: Type.String(),
  originalText: Type.String(),
  lineStart: Type.Integer({ minimum: 1 }),
  lineEnd: Type.Integer({ minimum: 1 }),
});

export const JobRequirementSchema = Type.Object({
  id: Type.String(),
  text: Type.String(),
  category: Type.Union([
    Type.Literal("responsibility"),
    Type.Literal("required-skill"),
    Type.Literal("preferred-skill"),
    Type.Literal("experience"),
    Type.Literal("education"),
    Type.Literal("leadership"),
    Type.Literal("domain"),
    Type.Literal("other"),
  ]),
  priority: Type.Union([
    Type.Literal("must"),
    Type.Literal("should"),
    Type.Literal("nice-to-have"),
  ]),
  explicitness: Type.Union([Type.Literal("explicit"), Type.Literal("inferred")]),
  evidence: Type.Array(JobEvidenceRefSchema, { minItems: 1 }),
  inference: Type.Optional(
    Type.Object({
      rationale: Type.String(),
      confidence: Type.Number({ minimum: 0, maximum: 1 }),
    }),
  ),
});

export const JobAnalysisDraftSchema = Type.Object({
  id: Type.String(),
  opportunityId: Type.String(),
  createdAt: Type.String(),
  roleSummary: Type.String(),
  requirements: Type.Array(JobRequirementSchema),
  warnings: Type.Array(Type.String()),
});

export const JobAnalysisRevisionSchema = Type.Intersect([
  JobAnalysisDraftSchema,
  Type.Object({
    revision: Type.Integer({ minimum: 1 }),
    confirmedAt: Type.String(),
  }),
]);

export type JobDescriptionBlock = Static<typeof JobDescriptionBlockSchema>;
export type JobOpportunity = Static<typeof JobOpportunitySchema>;
export type JobEvidenceRef = Static<typeof JobEvidenceRefSchema>;
export type JobRequirement = Static<typeof JobRequirementSchema>;
export type JobAnalysisDraft = Static<typeof JobAnalysisDraftSchema>;
export type JobAnalysisRevision = Static<typeof JobAnalysisRevisionSchema>;
