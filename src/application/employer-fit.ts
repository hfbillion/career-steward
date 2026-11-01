import { randomUUID } from "node:crypto";

import type { Static } from "typebox";
import { Type } from "typebox";

import type {
  CareerPreferenceRevision,
  EmployerPreferenceItem,
} from "../domain/career-preferences.js";
import type {
  CompanyClaim,
  CompanyResearchRevision,
} from "../domain/company-intelligence.js";
import {
  EmployerFitAssessmentSchema,
  type EmployerFitAssessment,
  type EmployerFitCap,
  type EmployerFitMetrics,
  type EmployerFitReportDraft,
  type PreferenceClaimMapping,
} from "../domain/employer-fit.js";
import { roundScore } from "./matching-policy.js";

export const EMPLOYER_FIT_POLICY_VERSION = "employer-fit/1.0" as const;

export const EMPLOYER_FIT_FACTORS: Readonly<
  Record<Exclude<EmployerFitAssessment, "unknown">, number>
> = {
  aligned: 1,
  "partially-aligned": 0.6,
  misaligned: 0,
};

export const PreferenceFitProposalSchema = Type.Object({
  preferenceId: Type.String({ minLength: 1 }),
  assessment: EmployerFitAssessmentSchema,
  companyClaimIds: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
  explanation: Type.String({ minLength: 1 }),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
});

export const EmployerFitProposalSchema = Type.Object({
  opportunityId: Type.String({ minLength: 1 }),
  mappings: Type.Array(PreferenceFitProposalSchema, { minItems: 1 }),
});

export type PreferenceFitProposal = Static<typeof PreferenceFitProposalSchema>;
export type EmployerFitProposal = Static<typeof EmployerFitProposalSchema>;

export interface EmployerFitEvaluator {
  provider?: string;
  modelId?: string;
}

export class EmployerFitValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployerFitValidationError";
  }
}

function requiresClaims(assessment: EmployerFitAssessment): boolean {
  return assessment !== "unknown";
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveMapping(
  preference: EmployerPreferenceItem,
  proposal: PreferenceFitProposal,
  claimById: ReadonlyMap<string, CompanyClaim>,
): PreferenceClaimMapping {
  if (requiresClaims(proposal.assessment) && proposal.companyClaimIds.length === 0) {
    throw new EmployerFitValidationError(
      `${proposal.assessment} mapping for preference ${preference.id} needs company claims`,
    );
  }
  if (!requiresClaims(proposal.assessment) && proposal.companyClaimIds.length > 0) {
    throw new EmployerFitValidationError(
      `Unknown mapping for preference ${preference.id} must not attach company claims`,
    );
  }

  const claims = proposal.companyClaimIds.map((claimId) => {
    const claim = claimById.get(claimId);
    if (!claim) {
      throw new EmployerFitValidationError(
        `Company claim ${claimId} is not present in the confirmed research revision`,
      );
    }
    if (claim.category !== preference.dimension) {
      throw new EmployerFitValidationError(
        `Company claim ${claimId} category ${claim.category} does not match preference dimension ${preference.dimension}`,
      );
    }
    return claim;
  });

  const factor =
    proposal.assessment === "unknown"
      ? undefined
      : EMPLOYER_FIT_FACTORS[proposal.assessment];
  const claimConfidence = claims.length > 0
    ? roundScore(average(claims.map((claim) => claim.confidence))) / 100
    : undefined;

  return {
    preferenceId: preference.id,
    dimension: preference.dimension,
    desiredOutcome: preference.desiredOutcome,
    importance: preference.importance,
    dealBreaker: preference.dealBreaker,
    assessment: proposal.assessment,
    companyClaims: claims,
    explanation: proposal.explanation.trim(),
    semanticConfidence: proposal.confidence,
    ...(claimConfidence === undefined ? {} : { claimConfidence }),
    ...(factor === undefined ? {} : { factor }),
    earnedPoints: roundScore(preference.importance * (factor ?? 0)),
  };
}

export function calculateEmployerFitMetrics(
  matrix: readonly PreferenceClaimMapping[],
): EmployerFitMetrics {
  const totalWeight = matrix.reduce((sum, item) => sum + item.importance, 0);
  const known = matrix.filter((item) => item.assessment !== "unknown");
  const knownWeight = known.reduce((sum, item) => sum + item.importance, 0);
  const earnedPoints = known.reduce((sum, item) => sum + item.earnedPoints, 0);
  const coverageRatio = totalWeight === 0 ? 0 : knownWeight / totalWeight;

  const alignmentScore = knownWeight === 0 ? 0 : roundScore((earnedPoints / knownWeight) * 100);
  const evidenceCoverage = roundScore(coverageRatio * 100);
  const confidenceScore = knownWeight === 0
    ? 0
    : roundScore(
        (known.reduce(
          (sum, item) =>
            sum +
            item.importance *
              item.semanticConfidence *
              (item.claimConfidence ?? 0),
          0,
        ) /
          knownWeight) *
          coverageRatio *
          100,
      );

  let employerFitScore = roundScore(alignmentScore * (0.7 + 0.3 * coverageRatio));
  const appliedCaps: EmployerFitCap[] = [];
  const hasMisalignedDealBreaker = matrix.some(
    (item) => item.dealBreaker && item.assessment === "misaligned",
  );
  const hasUnknownDealBreaker = matrix.some(
    (item) => item.dealBreaker && item.assessment === "unknown",
  );
  if (hasMisalignedDealBreaker && employerFitScore > 49) {
    employerFitScore = 49;
    appliedCaps.push("deal-breaker-misaligned-cap-49");
  } else if (hasUnknownDealBreaker && employerFitScore > 69) {
    employerFitScore = 69;
    appliedCaps.push("deal-breaker-unknown-cap-69");
  }

  return {
    alignmentScore,
    evidenceCoverage,
    confidenceScore,
    employerFitScore,
    appliedCaps,
  };
}

export function buildEmployerFitReportDraft(
  preferences: CareerPreferenceRevision,
  research: CompanyResearchRevision,
  proposal: EmployerFitProposal,
  evaluator: EmployerFitEvaluator = {},
  now = new Date(),
): EmployerFitReportDraft {
  if (proposal.opportunityId !== research.opportunityId) {
    throw new EmployerFitValidationError(
      "Employer Fit opportunityId does not match the confirmed company research",
    );
  }

  const preferenceById = new Map(
    preferences.employerPreferences.map((item) => [item.id, item]),
  );
  const proposalByPreferenceId = new Map<string, PreferenceFitProposal>();
  for (const mapping of proposal.mappings) {
    if (!preferenceById.has(mapping.preferenceId)) {
      throw new EmployerFitValidationError(
        `Preference ${mapping.preferenceId} is not in confirmed preference revision ${preferences.revision}`,
      );
    }
    if (proposalByPreferenceId.has(mapping.preferenceId)) {
      throw new EmployerFitValidationError(
        `Preference ${mapping.preferenceId} is mapped more than once`,
      );
    }
    proposalByPreferenceId.set(mapping.preferenceId, mapping);
  }

  const missing = preferences.employerPreferences
    .filter((item) => !proposalByPreferenceId.has(item.id))
    .map((item) => item.id);
  if (missing.length > 0) {
    throw new EmployerFitValidationError(
      `Employer Fit proposal is missing preference(s): ${missing.join(", ")}`,
    );
  }

  const claimById = new Map(research.claims.map((claim) => [claim.id, claim]));
  const preferenceMatrix = preferences.employerPreferences.map((preference) =>
    resolveMapping(
      preference,
      proposalByPreferenceId.get(preference.id)!,
      claimById,
    ),
  );
  const metrics = calculateEmployerFitMetrics(preferenceMatrix);

  return {
    id: randomUUID(),
    opportunityId: research.opportunityId,
    preferenceRevision: preferences.revision,
    companyResearchRevision: research.revision,
    createdAt: now.toISOString(),
    policyVersion: EMPLOYER_FIT_POLICY_VERSION,
    evaluator: {
      ...(evaluator.provider ? { provider: evaluator.provider } : {}),
      ...(evaluator.modelId ? { modelId: evaluator.modelId } : {}),
    },
    metrics,
    preferenceMatrix,
    alignedPreferenceIds: preferenceMatrix
      .filter((item) => item.assessment === "aligned")
      .map((item) => item.preferenceId),
    concernPreferenceIds: preferenceMatrix
      .filter((item) => item.assessment === "misaligned")
      .map((item) => item.preferenceId),
    unknownPreferenceIds: preferenceMatrix
      .filter((item) => item.assessment === "unknown")
      .map((item) => item.preferenceId),
  };
}
