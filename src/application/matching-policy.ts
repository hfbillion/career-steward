import type { JobRequirement } from "../domain/job-opportunity.js";
import type {
  MatchAssessment,
  MatchMetrics,
} from "../domain/job-match.js";

export const MATCHING_POLICY_VERSION = "matching-policy/1.0" as const;

export const PRIORITY_WEIGHTS: Record<JobRequirement["priority"], number> = {
  must: 5,
  should: 3,
  "nice-to-have": 1,
};

export const ASSESSMENT_FACTORS: Record<MatchAssessment, number | undefined> = {
  strong: 1,
  transferable: 0.65,
  weak: 0.3,
  gap: 0,
  unknown: undefined,
};

export interface RequirementAssessmentInput {
  priority: JobRequirement["priority"];
  assessment: MatchAssessment;
  confidence: number;
}

export function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Calculate explainable job-match metrics using matching-policy/1.0.
 *
 * Policy decisions:
 * - unknown requirements are excluded from capabilityScore;
 * - evidenceCoverage reduces matchScore using 0.7 + 0.3 * coverage;
 * - confidenceScore combines known-assessment confidence with coverage;
 * - must+gap caps matchScore at 69;
 * - otherwise must+unknown caps matchScore at 79.
 *
 * Keep this function pure and deterministic so policy versions remain testable and reproducible.
 */
export function calculateMatchMetrics(
  requirements: readonly RequirementAssessmentInput[],
): MatchMetrics {
  let totalWeight = 0;
  let knownWeight = 0;
  let earnedPoints = 0;
  let weightedConfidence = 0;
  let hasMustGap = false;
  let hasMustUnknown = false;

  for (const requirement of requirements) {
    const weight = PRIORITY_WEIGHTS[requirement.priority];
    totalWeight += weight;

    if (requirement.assessment === "unknown") {
      if (requirement.priority === "must") hasMustUnknown = true;
      continue;
    }

    const factor = ASSESSMENT_FACTORS[requirement.assessment] ?? 0;
    knownWeight += weight;
    earnedPoints += weight * factor;
    weightedConfidence += weight * requirement.confidence;

    if (requirement.priority === "must" && requirement.assessment === "gap") {
      hasMustGap = true;
    }
  }

  const coverageRatio = totalWeight === 0 ? 0 : knownWeight / totalWeight;
  const capabilityScore = knownWeight === 0 ? 0 : (earnedPoints / knownWeight) * 100;
  const confidenceScore =
    knownWeight === 0 ? 0 : (weightedConfidence / knownWeight) * coverageRatio * 100;

  let matchScore = capabilityScore * (0.7 + 0.3 * coverageRatio);
  const appliedCaps: MatchMetrics["appliedCaps"] = [];

  if (hasMustGap && matchScore > 69) {
    matchScore = 69;
    appliedCaps.push("must-gap-cap-69");
  } else if (hasMustUnknown && matchScore > 79) {
    matchScore = 79;
    appliedCaps.push("must-unknown-cap-79");
  }

  return {
    capabilityScore: roundScore(capabilityScore),
    evidenceCoverage: roundScore(coverageRatio * 100),
    confidenceScore: roundScore(confidenceScore),
    matchScore: roundScore(matchScore),
    appliedCaps,
  };
}
