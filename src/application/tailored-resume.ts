import { randomUUID } from "node:crypto";

import type { Static } from "typebox";
import { Type } from "typebox";

import type {
  CandidateExperience,
  CandidateProfileRevision,
  EvidenceBackedString,
  EvidenceRef,
} from "../domain/candidate-profile.js";
import type { JobMatchReport, RequirementEvidenceMapping } from "../domain/job-match.js";
import type { JobAnalysisRevision, JobOpportunity } from "../domain/job-opportunity.js";
import type {
  AtsCompatibilityCheck,
  TailoredExperienceSection,
  TailoredResumeDraft,
  TailoredResumeRevision,
  TailoredResumeStatement,
  TailoredSkill,
} from "../domain/tailored-resume.js";
import { collectCandidateMatchEvidence } from "./job-match-engine.js";
import { PRIORITY_WEIGHTS, roundScore } from "./matching-policy.js";

export const TailoredStatementProposalSchema = Type.Object({
  text: Type.String({ minLength: 1 }),
  candidateEvidenceIds: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    uniqueItems: true,
  }),
  requirementIds: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    uniqueItems: true,
  }),
});

export const TailoredExperienceProposalSchema = Type.Object({
  experienceId: Type.String({ minLength: 1 }),
  bullets: Type.Array(TailoredStatementProposalSchema, { minItems: 1 }),
});

export const TailoredSkillProposalSchema = Type.Object({
  profileSkillIndex: Type.Integer({ minimum: 0 }),
  requirementIds: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    uniqueItems: true,
  }),
});

export const TailoredResumeProposalSchema = Type.Object({
  opportunityId: Type.String({ minLength: 1 }),
  headline: TailoredStatementProposalSchema,
  professionalSummary: TailoredStatementProposalSchema,
  experiences: Type.Array(TailoredExperienceProposalSchema),
  skills: Type.Array(TailoredSkillProposalSchema),
  educationIndexes: Type.Array(Type.Integer({ minimum: 0 }), { uniqueItems: true }),
});

export type TailoredStatementProposal = Static<typeof TailoredStatementProposalSchema>;
export type TailoredExperienceProposal = Static<typeof TailoredExperienceProposalSchema>;
export type TailoredSkillProposal = Static<typeof TailoredSkillProposalSchema>;
export type TailoredResumeProposal = Static<typeof TailoredResumeProposalSchema>;

export class TailoredResumeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TailoredResumeValidationError";
  }
}

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function collectFieldEvidence(
  target: Set<string>,
  field: EvidenceBackedString | undefined,
): void {
  if (!field) return;
  for (const evidence of field.evidence) target.add(evidence.id);
}

function collectExperienceEvidence(experience: CandidateExperience): ReadonlySet<string> {
  const ids = new Set<string>();
  collectFieldEvidence(ids, experience.company);
  collectFieldEvidence(ids, experience.title);
  collectFieldEvidence(ids, experience.startDate);
  collectFieldEvidence(ids, experience.endDate);
  collectFieldEvidence(ids, experience.summary);
  for (const achievement of experience.achievements) {
    collectFieldEvidence(ids, achievement);
  }
  return ids;
}

function resolveRequirementMappings(
  requirementIds: readonly string[],
  matchByRequirementId: ReadonlyMap<string, RequirementEvidenceMapping>,
): RequirementEvidenceMapping[] {
  const seen = new Set<string>();
  return requirementIds.map((requirementId) => {
    if (seen.has(requirementId)) {
      throw new TailoredResumeValidationError(
        `Requirement ${requirementId} is referenced more than once in one CV item`,
      );
    }
    seen.add(requirementId);
    const mapping = matchByRequirementId.get(requirementId);
    if (!mapping) {
      throw new TailoredResumeValidationError(
        `Requirement ${requirementId} is not in the current Match Report`,
      );
    }
    if (mapping.assessment === "gap" || mapping.assessment === "unknown") {
      throw new TailoredResumeValidationError(
        `Requirement ${requirementId} is ${mapping.assessment} and cannot be presented in the CV`,
      );
    }
    return mapping;
  });
}

function resolveStatement(
  proposal: TailoredStatementProposal,
  matchByRequirementId: ReadonlyMap<string, RequirementEvidenceMapping>,
  evidenceById: ReadonlyMap<string, EvidenceRef>,
  allowedEvidenceIds?: ReadonlySet<string>,
): TailoredResumeStatement {
  const mappings = resolveRequirementMappings(
    proposal.requirementIds,
    matchByRequirementId,
  );
  const mappedEvidenceIds = new Set(
    mappings.flatMap((mapping) =>
      mapping.candidateEvidence.map((evidence) => evidence.id),
    ),
  );
  const seenEvidence = new Set<string>();
  const candidateEvidence = proposal.candidateEvidenceIds.map((evidenceId) => {
    if (seenEvidence.has(evidenceId)) {
      throw new TailoredResumeValidationError(
        `Candidate evidence ${evidenceId} is duplicated in one CV statement`,
      );
    }
    seenEvidence.add(evidenceId);
    const evidence = evidenceById.get(evidenceId);
    if (!evidence) {
      throw new TailoredResumeValidationError(
        `Candidate evidence ${evidenceId} is not in the confirmed profile`,
      );
    }
    if (!mappedEvidenceIds.has(evidenceId)) {
      throw new TailoredResumeValidationError(
        `Candidate evidence ${evidenceId} was not matched to the cited requirements`,
      );
    }
    if (allowedEvidenceIds && !allowedEvidenceIds.has(evidenceId)) {
      throw new TailoredResumeValidationError(
        `Candidate evidence ${evidenceId} does not belong to the selected experience`,
      );
    }
    return evidence;
  });

  return {
    text: normalizeLine(proposal.text),
    candidateEvidence,
    requirementIds: [...proposal.requirementIds],
  };
}

function resolveSkill(
  proposal: TailoredSkillProposal,
  profile: CandidateProfileRevision,
  matchByRequirementId: ReadonlyMap<string, RequirementEvidenceMapping>,
): TailoredSkill {
  const skill = profile.skills[proposal.profileSkillIndex];
  if (!skill) {
    throw new TailoredResumeValidationError(
      `Profile skill index ${proposal.profileSkillIndex} does not exist`,
    );
  }
  const mappings = resolveRequirementMappings(
    proposal.requirementIds,
    matchByRequirementId,
  );
  const skillEvidenceIds = new Set(skill.evidence.map((evidence) => evidence.id));
  for (const mapping of mappings) {
    if (!mapping.candidateEvidence.some((evidence) => skillEvidenceIds.has(evidence.id))) {
      throw new TailoredResumeValidationError(
        `Profile skill ${proposal.profileSkillIndex} is not evidence for requirement ${mapping.requirementId}`,
      );
    }
  }

  return {
    profileSkillIndex: proposal.profileSkillIndex,
    value: normalizeLine(skill.value),
    requirementIds: [...proposal.requirementIds],
  };
}

function renderMarkdown(input: {
  name?: string;
  email?: string;
  phone?: string;
  targetJobTitle: string;
  headline: TailoredResumeStatement;
  professionalSummary: TailoredResumeStatement;
  experiences: readonly TailoredExperienceSection[];
  skills: readonly TailoredSkill[];
  education: readonly string[];
}): string {
  const lines: string[] = [
    `# ${normalizeLine(input.name ?? "Candidate")}`,
    "",
  ];
  const contacts = [input.email, input.phone].filter(
    (value): value is string => Boolean(value),
  );
  if (contacts.length > 0) lines.push(contacts.map(normalizeLine).join(" · "), "");
  lines.push(
    `Target Role: ${normalizeLine(input.targetJobTitle)}`,
    "",
    normalizeLine(input.headline.text),
    "",
    "## Professional Summary",
    "",
    normalizeLine(input.professionalSummary.text),
  );

  if (input.experiences.length > 0) {
    lines.push("", "## Experience");
    for (const experience of input.experiences) {
      lines.push(
        "",
        `### ${normalizeLine(experience.title)} — ${normalizeLine(experience.company)}`,
      );
      const dates = [experience.startDate, experience.endDate]
        .filter((value): value is string => Boolean(value))
        .map(normalizeLine);
      if (dates.length > 0) lines.push("", dates.join(" – "));
      for (const bullet of experience.bullets) {
        lines.push(`- ${normalizeLine(bullet.text)}`);
      }
    }
  }

  if (input.skills.length > 0) {
    lines.push("", "## Skills", "", input.skills.map((skill) => skill.value).join(", "));
  }
  if (input.education.length > 0) {
    lines.push("", "## Education", "");
    for (const education of input.education) lines.push(`- ${normalizeLine(education)}`);
  }
  return `${lines.join("\n").trim()}\n`;
}

function buildAtsChecks(
  markdown: string,
  contact: { name?: string; email?: string; phone?: string },
): AtsCompatibilityCheck[] {
  return [
    {
      id: "standard-headings",
      passed: markdown.includes("## Professional Summary"),
      detail: "Uses conventional text section headings.",
    },
    {
      id: "single-column",
      passed: true,
      detail: "Canonical Markdown renderer emits a single reading order.",
    },
    {
      id: "no-tables",
      passed: !/^\s*\|.*\|\s*$/m.test(markdown),
      detail: "No Markdown table rows detected.",
    },
    {
      id: "no-images",
      passed: !/!\[[^\]]*\]\(/.test(markdown),
      detail: "No image syntax detected.",
    },
    {
      id: "no-html",
      passed: !/<[a-z][^>]*>/i.test(markdown),
      detail: "No HTML elements detected.",
    },
    {
      id: "contact-details",
      passed: Boolean(contact.name && (contact.email || contact.phone)),
      detail: "Requires a confirmed name and at least one confirmed contact method.",
    },
    {
      id: "evidence-grounded",
      passed: true,
      detail: "Every generated statement passed evidence and requirement validation.",
    },
  ];
}

export function buildTailoredResumeDraft(
  profile: CandidateProfileRevision,
  opportunity: JobOpportunity,
  analysis: JobAnalysisRevision,
  match: JobMatchReport,
  proposal: TailoredResumeProposal,
  now = new Date(),
): TailoredResumeDraft {
  if (
    proposal.opportunityId !== opportunity.id ||
    opportunity.id !== analysis.opportunityId ||
    opportunity.id !== match.opportunityId
  ) {
    throw new TailoredResumeValidationError(
      "Tailored CV inputs do not refer to the same opportunity",
    );
  }
  if (
    profile.revision !== match.profileRevision ||
    analysis.revision !== match.jobAnalysisRevision
  ) {
    throw new TailoredResumeValidationError(
      "Match Report is stale for the current profile or job analysis revision",
    );
  }

  const evidenceById = collectCandidateMatchEvidence(profile);
  const matchByRequirementId = new Map(
    match.requirementMatrix.map((mapping) => [mapping.requirementId, mapping]),
  );
  const headline = resolveStatement(
    proposal.headline,
    matchByRequirementId,
    evidenceById,
  );
  const professionalSummary = resolveStatement(
    proposal.professionalSummary,
    matchByRequirementId,
    evidenceById,
  );

  const experienceById = new Map(
    profile.experiences.map((experience) => [experience.id, experience]),
  );
  const seenExperienceIds = new Set<string>();
  const experiences = proposal.experiences.map((item): TailoredExperienceSection => {
    if (seenExperienceIds.has(item.experienceId)) {
      throw new TailoredResumeValidationError(
        `Experience ${item.experienceId} is selected more than once`,
      );
    }
    seenExperienceIds.add(item.experienceId);
    const experience = experienceById.get(item.experienceId);
    if (!experience) {
      throw new TailoredResumeValidationError(
        `Experience ${item.experienceId} is not in the confirmed profile`,
      );
    }
    const allowedEvidenceIds = collectExperienceEvidence(experience);
    return {
      experienceId: experience.id,
      company: normalizeLine(experience.company.value),
      title: normalizeLine(experience.title.value),
      ...(experience.startDate
        ? { startDate: normalizeLine(experience.startDate.value) }
        : {}),
      ...(experience.endDate ? { endDate: normalizeLine(experience.endDate.value) } : {}),
      bullets: item.bullets.map((bullet) =>
        resolveStatement(
          bullet,
          matchByRequirementId,
          evidenceById,
          allowedEvidenceIds,
        ),
      ),
    };
  });

  const seenSkillIndexes = new Set<number>();
  const skills = proposal.skills.map((item) => {
    if (seenSkillIndexes.has(item.profileSkillIndex)) {
      throw new TailoredResumeValidationError(
        `Profile skill index ${item.profileSkillIndex} is selected more than once`,
      );
    }
    seenSkillIndexes.add(item.profileSkillIndex);
    return resolveSkill(item, profile, matchByRequirementId);
  });

  const seenEducationIndexes = new Set<number>();
  const education = proposal.educationIndexes.map((index) => {
    if (seenEducationIndexes.has(index)) {
      throw new TailoredResumeValidationError(
        `Profile education index ${index} is selected more than once`,
      );
    }
    seenEducationIndexes.add(index);
    const item = profile.education[index];
    if (!item) {
      throw new TailoredResumeValidationError(
        `Profile education index ${index} does not exist`,
      );
    }
    return normalizeLine(item.value);
  });

  const coveredRequirementIds = new Set<string>([
    ...headline.requirementIds,
    ...professionalSummary.requirementIds,
    ...experiences.flatMap((experience) =>
      experience.bullets.flatMap((bullet) => bullet.requirementIds),
    ),
    ...skills.flatMap((skill) => skill.requirementIds),
  ]);
  const totalWeight = analysis.requirements.reduce(
    (sum, requirement) => sum + PRIORITY_WEIGHTS[requirement.priority],
    0,
  );
  const coveredWeight = analysis.requirements.reduce(
    (sum, requirement) =>
      sum +
      (coveredRequirementIds.has(requirement.id)
        ? PRIORITY_WEIGHTS[requirement.priority]
        : 0),
    0,
  );
  const uncoveredRequirementIds = analysis.requirements
    .filter((requirement) => !coveredRequirementIds.has(requirement.id))
    .map((requirement) => requirement.id);

  const contact = {
    ...(profile.name ? { name: normalizeLine(profile.name.value) } : {}),
    ...(profile.email ? { email: normalizeLine(profile.email.value) } : {}),
    ...(profile.phone ? { phone: normalizeLine(profile.phone.value) } : {}),
  };
  const markdown = renderMarkdown({
    ...contact,
    targetJobTitle: opportunity.jobTitle,
    headline,
    professionalSummary,
    experiences,
    skills,
    education,
  });
  const atsChecks = buildAtsChecks(markdown, contact);

  const citedMappings = [...coveredRequirementIds]
    .map((id) => matchByRequirementId.get(id))
    .filter((mapping): mapping is RequirementEvidenceMapping => Boolean(mapping));
  const warnings: string[] = [];
  for (const mapping of citedMappings) {
    if (mapping.assessment === "transferable" || mapping.assessment === "weak") {
      warnings.push(
        `Requirement ${mapping.requirementId} is included from a ${mapping.assessment} match; review wording carefully.`,
      );
    }
  }
  for (const requirement of analysis.requirements) {
    if (requirement.priority === "must" && !coveredRequirementIds.has(requirement.id)) {
      warnings.push(`Must requirement ${requirement.id} is not covered by the CV.`);
    }
  }
  for (const check of atsChecks) {
    if (!check.passed) warnings.push(`ATS check ${check.id} needs review: ${check.detail}`);
  }

  return {
    id: randomUUID(),
    opportunityId: opportunity.id,
    companyName: opportunity.companyName,
    targetJobTitle: opportunity.jobTitle,
    profileRevision: profile.revision,
    jobAnalysisRevision: analysis.revision,
    matchReportRevision: match.revision,
    createdAt: now.toISOString(),
    contact,
    headline,
    professionalSummary,
    experiences,
    skills,
    education,
    requirementCoverage: {
      coveredRequirementIds: analysis.requirements
        .filter((requirement) => coveredRequirementIds.has(requirement.id))
        .map((requirement) => requirement.id),
      uncoveredRequirementIds,
      coverageScore: totalWeight === 0 ? 0 : roundScore((coveredWeight / totalWeight) * 100),
    },
    atsChecks,
    warnings,
    markdown,
  };
}

export function confirmTailoredResumeDraft(
  draft: TailoredResumeDraft,
  revision: number,
  confirmedAt = new Date(),
): TailoredResumeRevision {
  return {
    ...draft,
    revision,
    confirmedAt: confirmedAt.toISOString(),
  };
}
