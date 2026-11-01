import { randomUUID } from "node:crypto";

import type { Static } from "typebox";
import { Type } from "typebox";

import type {
  CandidateProfileRevision,
  EvidenceBackedString,
  EvidenceRef,
} from "../domain/candidate-profile.js";
import type {
  JobMatchReportDraft,
  MatchAssessment,
  RequirementEvidenceMapping,
} from "../domain/job-match.js";
import type {
  JobAnalysisRevision,
  JobRequirement,
} from "../domain/job-opportunity.js";
import {
  ASSESSMENT_FACTORS,
  calculateMatchMetrics,
  MATCHING_POLICY_VERSION,
  PRIORITY_WEIGHTS,
  roundScore,
} from "./matching-policy.js";

export const RequirementMappingProposalSchema = Type.Object({
  requirementId: Type.String({ minLength: 1 }),
  assessment: Type.Union([
    Type.Literal("strong"),
    Type.Literal("transferable"),
    Type.Literal("weak"),
    Type.Literal("gap"),
    Type.Literal("unknown"),
  ]),
  candidateEvidenceIds: Type.Array(Type.String({ minLength: 1 }), {
    uniqueItems: true,
  }),
  explanation: Type.String({ minLength: 1 }),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
});

export const JobMatchProposalSchema = Type.Object({
  opportunityId: Type.String({ minLength: 1 }),
  mappings: Type.Array(RequirementMappingProposalSchema, { minItems: 1 }),
});

export type RequirementMappingProposal = Static<typeof RequirementMappingProposalSchema>;
export type JobMatchProposal = Static<typeof JobMatchProposalSchema>;

export interface MatchEvaluator {
  provider?: string;
  modelId?: string;
}

export class JobMatchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobMatchValidationError";
  }
}

function addFieldEvidence(
  evidenceById: Map<string, EvidenceRef>,
  field: EvidenceBackedString | undefined,
): void {
  if (!field) return;
  for (const evidence of field.evidence) evidenceById.set(evidence.id, evidence);
}

export function collectCandidateMatchEvidence(
  profile: CandidateProfileRevision,
): ReadonlyMap<string, EvidenceRef> {
  const evidenceById = new Map<string, EvidenceRef>();

  // Contact identity is intentionally excluded from capability matching.
  addFieldEvidence(evidenceById, profile.headline);
  for (const experience of profile.experiences) {
    addFieldEvidence(evidenceById, experience.company);
    addFieldEvidence(evidenceById, experience.title);
    addFieldEvidence(evidenceById, experience.startDate);
    addFieldEvidence(evidenceById, experience.endDate);
    addFieldEvidence(evidenceById, experience.summary);
    for (const achievement of experience.achievements) {
      addFieldEvidence(evidenceById, achievement);
    }
  }
  for (const skill of profile.skills) addFieldEvidence(evidenceById, skill);
  for (const education of profile.education) addFieldEvidence(evidenceById, education);

  return evidenceById;
}

function requiresEvidence(assessment: MatchAssessment): boolean {
  return assessment === "strong" || assessment === "transferable" || assessment === "weak";
}

function resolveMapping(
  requirement: JobRequirement,
  proposal: RequirementMappingProposal,
  evidenceById: ReadonlyMap<string, EvidenceRef>,
): RequirementEvidenceMapping {
  if (requiresEvidence(proposal.assessment) && proposal.candidateEvidenceIds.length === 0) {
    throw new JobMatchValidationError(
      `${proposal.assessment} mapping for requirement ${requirement.id} needs candidate evidence`,
    );
  }
  if (!requiresEvidence(proposal.assessment) && proposal.candidateEvidenceIds.length > 0) {
    throw new JobMatchValidationError(
      `${proposal.assessment} mapping for requirement ${requirement.id} must not attach candidate evidence`,
    );
  }

  const candidateEvidence = proposal.candidateEvidenceIds.map((evidenceId) => {
    const evidence = evidenceById.get(evidenceId);
    if (!evidence) {
      throw new JobMatchValidationError(
        `Candidate evidence ${evidenceId} is not present in the confirmed profile`,
      );
    }
    return evidence;
  });

  const weight = PRIORITY_WEIGHTS[requirement.priority];
  const factor = ASSESSMENT_FACTORS[proposal.assessment];

  return {
    requirementId: requirement.id,
    requirementText: requirement.text,
    priority: requirement.priority,
    assessment: proposal.assessment,
    candidateEvidence,
    explanation: proposal.explanation.trim(),
    confidence: proposal.confidence,
    weight,
    ...(factor === undefined ? {} : { factor }),
    earnedPoints: roundScore(weight * (factor ?? 0)),
  };
}

export function buildJobMatchReportDraft(
  profile: CandidateProfileRevision,
  analysis: JobAnalysisRevision,
  proposal: JobMatchProposal,
  evaluator: MatchEvaluator = {},
  now = new Date(),
): JobMatchReportDraft {
  if (proposal.opportunityId !== analysis.opportunityId) {
    throw new JobMatchValidationError(
      "Match proposal opportunityId does not match the confirmed job analysis",
    );
  }

  const requirementsById = new Map(
    analysis.requirements.map((requirement) => [requirement.id, requirement]),
  );
  const proposalsByRequirementId = new Map<string, RequirementMappingProposal>();

  for (const mapping of proposal.mappings) {
    if (!requirementsById.has(mapping.requirementId)) {
      throw new JobMatchValidationError(
        `Requirement ${mapping.requirementId} is not in confirmed job analysis revision ${analysis.revision}`,
      );
    }
    if (proposalsByRequirementId.has(mapping.requirementId)) {
      throw new JobMatchValidationError(
        `Requirement ${mapping.requirementId} is mapped more than once`,
      );
    }
    proposalsByRequirementId.set(mapping.requirementId, mapping);
  }

  const missingRequirementIds = analysis.requirements
    .filter((requirement) => !proposalsByRequirementId.has(requirement.id))
    .map((requirement) => requirement.id);
  if (missingRequirementIds.length > 0) {
    throw new JobMatchValidationError(
      `Match proposal is missing requirement(s): ${missingRequirementIds.join(", ")}`,
    );
  }

  const evidenceById = collectCandidateMatchEvidence(profile);
  const requirementMatrix = analysis.requirements.map((requirement) =>
    resolveMapping(requirement, proposalsByRequirementId.get(requirement.id)!, evidenceById),
  );
  const metrics = calculateMatchMetrics(requirementMatrix);

  return {
    id: randomUUID(),
    opportunityId: analysis.opportunityId,
    profileRevision: profile.revision,
    jobAnalysisRevision: analysis.revision,
    createdAt: now.toISOString(),
    policyVersion: MATCHING_POLICY_VERSION,
    evaluator: {
      ...(evaluator.provider ? { provider: evaluator.provider } : {}),
      ...(evaluator.modelId ? { modelId: evaluator.modelId } : {}),
    },
    metrics,
    requirementMatrix,
    strengthRequirementIds: requirementMatrix
      .filter((mapping) => mapping.assessment === "strong")
      .map((mapping) => mapping.requirementId),
    transferableRequirementIds: requirementMatrix
      .filter((mapping) => mapping.assessment === "transferable")
      .map((mapping) => mapping.requirementId),
    criticalGapRequirementIds: requirementMatrix
      .filter((mapping) => mapping.priority === "must" && mapping.assessment === "gap")
      .map((mapping) => mapping.requirementId),
    unknownRequirementIds: requirementMatrix
      .filter((mapping) => mapping.assessment === "unknown")
      .map((mapping) => mapping.requirementId),
  };
}
