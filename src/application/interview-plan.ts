import { randomUUID } from "node:crypto";

import type { Static } from "typebox";
import { Type } from "typebox";

import type {
  CandidateExperience,
  CandidateProfileRevision,
  EvidenceBackedString,
  EvidenceRef,
} from "../domain/candidate-profile.js";
import type {
  CompanyClaim,
  CompanyResearchRevision,
} from "../domain/company-intelligence.js";
import type {
  InterviewFocusType,
  InterviewPlanReportDraft,
  InterviewPreparationItem,
  ReverseInterviewQuestion,
  StarStory,
} from "../domain/interview-plan.js";
import type { JobMatchReport, MatchAssessment, RequirementEvidenceMapping } from "../domain/job-match.js";
import type { JobAnalysisRevision, JobOpportunity } from "../domain/job-opportunity.js";
import { collectCandidateMatchEvidence } from "./job-match-engine.js";

export const InterviewPreparationItemProposalSchema = Type.Object({
  requirementId: Type.String({ minLength: 1 }),
  candidateEvidenceIds: Type.Array(Type.String({ minLength: 1 }), {
    uniqueItems: true,
  }),
  objective: Type.String({ minLength: 1 }),
  talkingPoints: Type.Array(Type.String({ minLength: 1 })),
  practiceQuestions: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  preparationActions: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  honestBoundary: Type.Optional(Type.String({ minLength: 1 })),
});

export const StarStoryProposalSchema = Type.Object({
  title: Type.String({ minLength: 1 }),
  experienceId: Type.String({ minLength: 1 }),
  requirementIds: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    uniqueItems: true,
  }),
  candidateEvidenceIds: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    uniqueItems: true,
  }),
  situation: Type.String({ minLength: 1 }),
  task: Type.String({ minLength: 1 }),
  action: Type.String({ minLength: 1 }),
  result: Type.String({ minLength: 1 }),
});

export const InterviewScheduleSessionProposalSchema = Type.Object({
  day: Type.Integer({ minimum: 1 }),
  title: Type.String({ minLength: 1 }),
  durationMinutes: Type.Integer({ minimum: 15, maximum: 240 }),
  requirementIds: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    uniqueItems: true,
  }),
  activities: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
});

export const ReverseInterviewQuestionProposalSchema = Type.Object({
  question: Type.String({ minLength: 1 }),
  rationale: Type.String({ minLength: 1 }),
  companyClaimIds: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
});

export const InterviewPlanProposalSchema = Type.Object({
  opportunityId: Type.String({ minLength: 1 }),
  preparationItems: Type.Array(InterviewPreparationItemProposalSchema, { minItems: 1 }),
  starStories: Type.Array(StarStoryProposalSchema),
  schedule: Type.Array(InterviewScheduleSessionProposalSchema, { minItems: 1 }),
  reverseInterviewQuestions: Type.Array(ReverseInterviewQuestionProposalSchema, {
    minItems: 1,
  }),
});

export type InterviewPreparationItemProposal = Static<
  typeof InterviewPreparationItemProposalSchema
>;
export type StarStoryProposal = Static<typeof StarStoryProposalSchema>;
export type InterviewScheduleSessionProposal = Static<
  typeof InterviewScheduleSessionProposalSchema
>;
export type ReverseInterviewQuestionProposal = Static<
  typeof ReverseInterviewQuestionProposalSchema
>;
export type InterviewPlanProposal = Static<typeof InterviewPlanProposalSchema>;

export interface InterviewPlanEvaluator {
  provider?: string;
  modelId?: string;
}

export class InterviewPlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterviewPlanValidationError";
  }
}

const FOCUS_BY_ASSESSMENT: Readonly<Record<MatchAssessment, InterviewFocusType>> = {
  strong: "leverage-strength",
  transferable: "demonstrate-transfer",
  weak: "strengthen-weakness",
  gap: "mitigate-gap",
  unknown: "clarify-unknown",
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function addFieldEvidence(
  target: Set<string>,
  field: EvidenceBackedString | undefined,
): void {
  if (!field) return;
  for (const evidence of field.evidence) target.add(evidence.id);
}

function collectExperienceEvidence(experience: CandidateExperience): ReadonlySet<string> {
  const ids = new Set<string>();
  addFieldEvidence(ids, experience.company);
  addFieldEvidence(ids, experience.title);
  addFieldEvidence(ids, experience.startDate);
  addFieldEvidence(ids, experience.endDate);
  addFieldEvidence(ids, experience.summary);
  for (const achievement of experience.achievements) addFieldEvidence(ids, achievement);
  return ids;
}

function resolveEvidence(
  evidenceIds: readonly string[],
  mapping: RequirementEvidenceMapping,
  evidenceById: ReadonlyMap<string, EvidenceRef>,
): EvidenceRef[] {
  const allowedIds = new Set(mapping.candidateEvidence.map((evidence) => evidence.id));
  return evidenceIds.map((id) => {
    const evidence = evidenceById.get(id);
    if (!evidence) {
      throw new InterviewPlanValidationError(
        `Candidate evidence ${id} is not in the confirmed profile`,
      );
    }
    if (!allowedIds.has(id)) {
      throw new InterviewPlanValidationError(
        `Candidate evidence ${id} was not matched to requirement ${mapping.requirementId}`,
      );
    }
    return evidence;
  });
}

function resolvePreparationItem(
  proposal: InterviewPreparationItemProposal,
  mapping: RequirementEvidenceMapping,
  evidenceById: ReadonlyMap<string, EvidenceRef>,
): InterviewPreparationItem {
  const isEvidenceBacked =
    mapping.assessment === "strong" ||
    mapping.assessment === "transferable" ||
    mapping.assessment === "weak";
  if (isEvidenceBacked && proposal.candidateEvidenceIds.length === 0) {
    throw new InterviewPlanValidationError(
      `${mapping.assessment} preparation for requirement ${mapping.requirementId} needs candidate evidence`,
    );
  }
  if (!isEvidenceBacked && proposal.candidateEvidenceIds.length > 0) {
    throw new InterviewPlanValidationError(
      `${mapping.assessment} preparation for requirement ${mapping.requirementId} must not attach candidate evidence`,
    );
  }
  if (isEvidenceBacked && proposal.talkingPoints.length === 0) {
    throw new InterviewPlanValidationError(
      `${mapping.assessment} preparation for requirement ${mapping.requirementId} needs talking points`,
    );
  }
  if (mapping.assessment !== "strong" && !proposal.honestBoundary) {
    throw new InterviewPlanValidationError(
      `${mapping.assessment} preparation for requirement ${mapping.requirementId} needs an honest boundary`,
    );
  }
  if (
    mapping.assessment !== "strong" &&
    !proposal.honestBoundary
  ) {
    throw new InterviewPlanValidationError(
      `${mapping.assessment} preparation for requirement ${mapping.requirementId} needs an honestBoundary`,
    );
  }

  return {
    requirementId: mapping.requirementId,
    requirementText: mapping.requirementText,
    priority: mapping.priority,
    assessment: mapping.assessment,
    focusType: FOCUS_BY_ASSESSMENT[mapping.assessment],
    candidateEvidence: resolveEvidence(
      proposal.candidateEvidenceIds,
      mapping,
      evidenceById,
    ),
    objective: normalizeText(proposal.objective),
    talkingPoints: proposal.talkingPoints.map(normalizeText),
    practiceQuestions: proposal.practiceQuestions.map(normalizeText),
    preparationActions: proposal.preparationActions.map(normalizeText),
    ...(proposal.honestBoundary
      ? { honestBoundary: normalizeText(proposal.honestBoundary) }
      : {}),
  };
}

function resolveStarStory(
  proposal: StarStoryProposal,
  profile: CandidateProfileRevision,
  matchByRequirementId: ReadonlyMap<string, RequirementEvidenceMapping>,
  evidenceById: ReadonlyMap<string, EvidenceRef>,
): StarStory {
  const experience = profile.experiences.find((item) => item.id === proposal.experienceId);
  if (!experience) {
    throw new InterviewPlanValidationError(
      `STAR story experience ${proposal.experienceId} is not in the confirmed profile`,
    );
  }
  const experienceEvidenceIds = collectExperienceEvidence(experience);
  const allowedEvidenceIds = new Set<string>();
  for (const requirementId of proposal.requirementIds) {
    const mapping = matchByRequirementId.get(requirementId);
    if (!mapping) {
      throw new InterviewPlanValidationError(
        `STAR story requirement ${requirementId} is not in the current Match Report`,
      );
    }
    if (mapping.assessment === "gap" || mapping.assessment === "unknown") {
      throw new InterviewPlanValidationError(
        `STAR story cannot claim ${mapping.assessment} requirement ${requirementId}`,
      );
    }
    for (const evidence of mapping.candidateEvidence) allowedEvidenceIds.add(evidence.id);
  }
  const candidateEvidence = proposal.candidateEvidenceIds.map((id) => {
    const evidence = evidenceById.get(id);
    if (!evidence) {
      throw new InterviewPlanValidationError(
        `STAR story evidence ${id} is not in the confirmed profile`,
      );
    }
    if (!allowedEvidenceIds.has(id)) {
      throw new InterviewPlanValidationError(
        `STAR story evidence ${id} was not matched to its cited requirements`,
      );
    }
    if (!experienceEvidenceIds.has(id)) {
      throw new InterviewPlanValidationError(
        `STAR story evidence ${id} does not belong to experience ${experience.id}`,
      );
    }
    return evidence;
  });

  return {
    id: randomUUID(),
    title: normalizeText(proposal.title),
    experienceId: experience.id,
    company: normalizeText(experience.company.value),
    roleTitle: normalizeText(experience.title.value),
    requirementIds: [...proposal.requirementIds],
    candidateEvidence,
    situation: normalizeText(proposal.situation),
    task: normalizeText(proposal.task),
    action: normalizeText(proposal.action),
    result: normalizeText(proposal.result),
  };
}

function resolveReverseQuestions(
  proposals: readonly ReverseInterviewQuestionProposal[],
  research: CompanyResearchRevision | undefined,
): ReverseInterviewQuestion[] {
  const claimById = new Map<string, CompanyClaim>(
    research?.claims.map((claim) => [claim.id, claim]) ?? [],
  );
  return proposals.map((proposal) => ({
    question: normalizeText(proposal.question),
    rationale: normalizeText(proposal.rationale),
    companyClaims: proposal.companyClaimIds.map((id) => {
      const claim = claimById.get(id);
      if (!claim) {
        throw new InterviewPlanValidationError(
          `Reverse interview question references unavailable company claim ${id}`,
        );
      }
      return claim;
    }),
  }));
}

export function buildInterviewPlanReportDraft(
  profile: CandidateProfileRevision,
  opportunity: JobOpportunity,
  analysis: JobAnalysisRevision,
  match: JobMatchReport,
  research: CompanyResearchRevision | undefined,
  proposal: InterviewPlanProposal,
  evaluator: InterviewPlanEvaluator = {},
  now = new Date(),
): InterviewPlanReportDraft {
  if (
    proposal.opportunityId !== opportunity.id ||
    opportunity.id !== analysis.opportunityId ||
    opportunity.id !== match.opportunityId ||
    (research && research.opportunityId !== opportunity.id)
  ) {
    throw new InterviewPlanValidationError(
      "Interview Plan inputs do not refer to the same opportunity",
    );
  }
  if (
    profile.revision !== match.profileRevision ||
    analysis.revision !== match.jobAnalysisRevision
  ) {
    throw new InterviewPlanValidationError(
      "Match Report is stale for the current profile or job analysis revision",
    );
  }

  const matchByRequirementId = new Map(
    match.requirementMatrix.map((mapping) => [mapping.requirementId, mapping]),
  );
  const proposalByRequirementId = new Map<string, InterviewPreparationItemProposal>();
  for (const item of proposal.preparationItems) {
    if (!matchByRequirementId.has(item.requirementId)) {
      throw new InterviewPlanValidationError(
        `Preparation item requirement ${item.requirementId} is not in the current Match Report`,
      );
    }
    if (proposalByRequirementId.has(item.requirementId)) {
      throw new InterviewPlanValidationError(
        `Requirement ${item.requirementId} has more than one preparation item`,
      );
    }
    proposalByRequirementId.set(item.requirementId, item);
  }
  const missingRequirementIds = match.requirementMatrix
    .filter((mapping) => !proposalByRequirementId.has(mapping.requirementId))
    .map((mapping) => mapping.requirementId);
  if (missingRequirementIds.length > 0) {
    throw new InterviewPlanValidationError(
      `Interview Plan is missing requirement(s): ${missingRequirementIds.join(", ")}`,
    );
  }

  const evidenceById = collectCandidateMatchEvidence(profile);
  const preparationItems = match.requirementMatrix.map((mapping) =>
    resolvePreparationItem(
      proposalByRequirementId.get(mapping.requirementId)!,
      mapping,
      evidenceById,
    ),
  );
  const starStories = proposal.starStories.map((story) =>
    resolveStarStory(story, profile, matchByRequirementId, evidenceById),
  );

  const scheduledRequirementIds = new Set<string>();
  const schedule = proposal.schedule.map((session) => {
    for (const requirementId of session.requirementIds) {
      if (!matchByRequirementId.has(requirementId)) {
        throw new InterviewPlanValidationError(
          `Schedule references unknown requirement ${requirementId}`,
        );
      }
      scheduledRequirementIds.add(requirementId);
    }
    return {
      day: session.day,
      title: normalizeText(session.title),
      durationMinutes: session.durationMinutes,
      requirementIds: [...session.requirementIds],
      activities: session.activities.map(normalizeText),
    };
  });
  const unscheduledRequirementIds = match.requirementMatrix
    .filter((mapping) => !scheduledRequirementIds.has(mapping.requirementId))
    .map((mapping) => mapping.requirementId);
  if (unscheduledRequirementIds.length > 0) {
    throw new InterviewPlanValidationError(
      `Interview schedule is missing requirement(s): ${unscheduledRequirementIds.join(", ")}`,
    );
  }

  const reverseInterviewQuestions = resolveReverseQuestions(
    proposal.reverseInterviewQuestions,
    research,
  );
  const warnings: string[] = [];
  for (const item of preparationItems) {
    if (item.assessment !== "strong") {
      warnings.push(
        `${item.priority} requirement ${item.requirementId} is ${item.assessment}; use the honest boundary and preparation actions.`,
      );
    }
  }

  return {
    id: randomUUID(),
    opportunityId: opportunity.id,
    companyName: opportunity.companyName,
    jobTitle: opportunity.jobTitle,
    profileRevision: profile.revision,
    jobAnalysisRevision: analysis.revision,
    matchReportRevision: match.revision,
    ...(research ? { companyResearchRevision: research.revision } : {}),
    createdAt: now.toISOString(),
    evaluator: {
      ...(evaluator.provider ? { provider: evaluator.provider } : {}),
      ...(evaluator.modelId ? { modelId: evaluator.modelId } : {}),
    },
    preparationItems,
    starStories,
    schedule,
    reverseInterviewQuestions,
    metrics: {
      requirementCount: preparationItems.length,
      evidenceBackedItemCount: preparationItems.filter(
        (item) => item.candidateEvidence.length > 0,
      ).length,
      riskItemCount: preparationItems.filter((item) => item.assessment !== "strong").length,
      starStoryCount: starStories.length,
      scheduledDays: new Set(schedule.map((session) => session.day)).size,
      totalMinutes: schedule.reduce((sum, session) => sum + session.durationMinutes, 0),
    },
    warnings,
  };
}
