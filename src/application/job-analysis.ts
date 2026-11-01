import { randomUUID } from "node:crypto";

import type { Static } from "typebox";
import { Type } from "typebox";

import type {
  JobAnalysisDraft,
  JobAnalysisRevision,
  JobDescriptionBlock,
  JobEvidenceRef,
  JobOpportunity,
  JobRequirement,
} from "../domain/job-opportunity.js";

export const CreateJobOpportunityInputSchema = Type.Object({
  companyName: Type.String({ minLength: 1 }),
  jobTitle: Type.String({ minLength: 1 }),
  jdText: Type.String({ minLength: 40 }),
  sourceUrl: Type.Optional(Type.String({ minLength: 1 })),
});

export const JobRequirementProposalSchema = Type.Object({
  text: Type.String({ minLength: 1 }),
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
  evidenceBlockIds: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    uniqueItems: true,
  }),
  rationale: Type.Optional(Type.String({ minLength: 1 })),
  confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
});

export const JobAnalysisProposalSchema = Type.Object({
  opportunityId: Type.String({ minLength: 1 }),
  roleSummary: Type.String({ minLength: 1 }),
  requirements: Type.Array(JobRequirementProposalSchema, { minItems: 1 }),
  warnings: Type.Optional(Type.Array(Type.String())),
});

export type CreateJobOpportunityInput = Static<typeof CreateJobOpportunityInputSchema>;
export type JobRequirementProposal = Static<typeof JobRequirementProposalSchema>;
export type JobAnalysisProposal = Static<typeof JobAnalysisProposalSchema>;

export class JobAnalysisEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobAnalysisEvidenceError";
  }
}

export function splitJobDescription(rawText: string): JobDescriptionBlock[] {
  const blocks: JobDescriptionBlock[] = [];
  const lines = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  lines.forEach((line, index) => {
    const text = line.replace(/\s+/g, " ").trim();
    if (text.length === 0) return;

    blocks.push({
      id: `jd-b${blocks.length + 1}`,
      text,
      lineStart: index + 1,
      lineEnd: index + 1,
    });
  });

  if (blocks.length === 0) {
    throw new JobAnalysisEvidenceError("Job description does not contain extractable text");
  }

  return blocks;
}

export function createJobOpportunity(
  input: CreateJobOpportunityInput,
  now = new Date(),
): JobOpportunity {
  return {
    id: randomUUID(),
    companyName: input.companyName.trim(),
    jobTitle: input.jobTitle.trim(),
    source: {
      type: "manual",
      ...(input.sourceUrl ? { url: input.sourceUrl.trim() } : {}),
    },
    rawText: input.jdText,
    blocks: splitJobDescription(input.jdText),
    status: "captured",
    createdAt: now.toISOString(),
  };
}

function resolveRequirement(
  proposal: JobRequirementProposal,
  opportunity: JobOpportunity,
  blocksById: ReadonlyMap<string, JobDescriptionBlock>,
): JobRequirement {
  if (proposal.explicitness === "inferred") {
    if (!proposal.rationale || proposal.confidence === undefined) {
      throw new JobAnalysisEvidenceError(
        `Inferred requirement "${proposal.text}" needs both rationale and confidence`,
      );
    }
  } else if (proposal.rationale || proposal.confidence !== undefined) {
    throw new JobAnalysisEvidenceError(
      `Explicit requirement "${proposal.text}" must not be represented as an inference`,
    );
  }

  const evidence: JobEvidenceRef[] = proposal.evidenceBlockIds.map((blockId) => {
    const block = blocksById.get(blockId);
    if (!block) {
      throw new JobAnalysisEvidenceError(
        `JD evidence block ${blockId} does not exist in opportunity ${opportunity.id}`,
      );
    }

    return {
      opportunityId: opportunity.id,
      blockId: block.id,
      originalText: block.text,
      lineStart: block.lineStart,
      lineEnd: block.lineEnd,
    };
  });

  return {
    id: randomUUID(),
    text: proposal.text.trim(),
    category: proposal.category,
    priority: proposal.priority,
    explicitness: proposal.explicitness,
    evidence,
    ...(proposal.explicitness === "inferred"
      ? {
          inference: {
            rationale: proposal.rationale!,
            confidence: proposal.confidence!,
          },
        }
      : {}),
  };
}

export function buildJobAnalysisDraft(
  opportunity: JobOpportunity,
  proposal: JobAnalysisProposal,
  now = new Date(),
): JobAnalysisDraft {
  if (proposal.opportunityId !== opportunity.id) {
    throw new JobAnalysisEvidenceError(
      "Job analysis proposal opportunityId does not match the stored opportunity",
    );
  }

  const blocksById = new Map(opportunity.blocks.map((block) => [block.id, block]));

  return {
    id: randomUUID(),
    opportunityId: opportunity.id,
    createdAt: now.toISOString(),
    roleSummary: proposal.roleSummary.trim(),
    requirements: proposal.requirements.map((requirement) =>
      resolveRequirement(requirement, opportunity, blocksById),
    ),
    warnings: proposal.warnings ?? [],
  };
}

export function confirmJobAnalysisDraft(
  draft: JobAnalysisDraft,
  revision: number,
  confirmedAt = new Date(),
): JobAnalysisRevision {
  return {
    ...draft,
    revision,
    confirmedAt: confirmedAt.toISOString(),
  };
}
