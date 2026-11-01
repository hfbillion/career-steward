import { randomUUID } from "node:crypto";

import type { Static } from "typebox";
import { Type } from "typebox";

import {
  EmployerPreferenceDimensionSchema,
  type CareerPreferenceDraft,
  type CareerPreferenceRevision,
  type EmployerPreferenceDimension,
} from "../domain/career-preferences.js";

export const EmployerPreferenceProposalSchema = Type.Object({
  dimension: EmployerPreferenceDimensionSchema,
  importance: Type.Integer({ minimum: 1, maximum: 5 }),
  desiredOutcome: Type.String({ minLength: 1 }),
  dealBreaker: Type.Boolean(),
});

export const CareerPreferenceProposalSchema = Type.Object({
  employerPreferences: Type.Array(EmployerPreferenceProposalSchema, { minItems: 1 }),
  warnings: Type.Optional(Type.Array(Type.String())),
});

export type EmployerPreferenceProposal = Static<typeof EmployerPreferenceProposalSchema>;
export type CareerPreferenceProposal = Static<typeof CareerPreferenceProposalSchema>;

export class CareerPreferenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CareerPreferenceValidationError";
  }
}

export function buildCareerPreferenceDraft(
  proposal: CareerPreferenceProposal,
  now = new Date(),
): CareerPreferenceDraft {
  const seenDimensions = new Set<EmployerPreferenceDimension>();
  for (const item of proposal.employerPreferences) {
    if (seenDimensions.has(item.dimension)) {
      throw new CareerPreferenceValidationError(
        `Employer preference dimension ${item.dimension} is duplicated`,
      );
    }
    seenDimensions.add(item.dimension);
  }

  return {
    id: randomUUID(),
    createdAt: now.toISOString(),
    employerPreferences: proposal.employerPreferences.map((item) => ({
      id: randomUUID(),
      dimension: item.dimension,
      importance: item.importance,
      desiredOutcome: item.desiredOutcome.trim(),
      dealBreaker: item.dealBreaker,
    })),
    warnings: proposal.warnings ?? [],
  };
}

export function confirmCareerPreferenceDraft(
  draft: CareerPreferenceDraft,
  revision: number,
  confirmedAt = new Date(),
): CareerPreferenceRevision {
  return {
    ...draft,
    revision,
    confirmedAt: confirmedAt.toISOString(),
  };
}
