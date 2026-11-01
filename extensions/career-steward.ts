import { readFile } from "node:fs/promises";

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Value } from "typebox/value";

import {
  buildCareerDashboard,
  formatCareerDashboard,
} from "../src/application/career-dashboard.js";
import {
  CareerDataBackupArtifactSchema,
  CareerDataRestoreResultSchema,
  CreateCareerDataBackupInputSchema,
  RestoreCareerDataBackupInputSchema,
  createCareerDataBackup,
  inspectCareerDataBackup,
  restoreCareerDataBackup,
} from "../src/application/career-data-lifecycle.js";
import {
  buildCompanyResearchDraft,
  CompanyResearchProposalSchema,
} from "../src/application/company-research.js";
import {
  buildCareerPreferenceDraft,
  CareerPreferenceProposalSchema,
} from "../src/application/career-preferences.js";
import {
  buildEmployerFitReportDraft,
  EmployerFitProposalSchema,
} from "../src/application/employer-fit.js";
import {
  exportTailoredResume,
  ExportTailoredResumeInputSchema,
} from "../src/application/export-tailored-resume.js";
import {
  CompanySourceFetchError,
  fetchCompanySource,
  FetchCompanySourceInputSchema,
} from "../src/application/fetch-company-source.js";
import {
  buildTailoredResumeDraft,
  TailoredResumeProposalSchema,
} from "../src/application/tailored-resume.js";
import {
  buildJobAnalysisDraft,
  createJobOpportunity,
  CreateJobOpportunityInputSchema,
  JobAnalysisProposalSchema,
} from "../src/application/job-analysis.js";
import {
  buildJobMatchReportDraft,
  JobMatchProposalSchema,
} from "../src/application/job-match-engine.js";
import {
  buildInterviewPlanReportDraft,
  InterviewPlanProposalSchema,
} from "../src/application/interview-plan.js";
import {
  buildOpportunityEventDraft,
  buildOpportunityPipelineItem,
  buildOpportunityTimeline,
  RecordOpportunityEventInputSchema,
} from "../src/application/opportunity-tracking.js";
import {
  buildCandidateProfileDraft,
  CandidateProfileProposalSchema,
} from "../src/application/profile-proposal.js";
import {
  buildCandidateProfileAmendmentDraft,
  CandidateProfileAmendmentProposalSchema,
  summarizeCandidateProfileRevision,
} from "../src/application/profile-amendment.js";
import {
  CandidateProfileDraftSchema,
  CandidateProfileRevisionSchema,
  type CandidateProfileDraft,
} from "../src/domain/candidate-profile.js";
import {
  CareerDashboardSchema,
  type CareerDashboard,
} from "../src/domain/career-dashboard.js";
import {
  CandidateProfileAmendmentDraftSchema,
  CandidateProfileRevisionSummarySchema,
  type CandidateProfileAmendmentDraft,
} from "../src/domain/profile-amendment.js";
import {
  CareerPreferenceDraftSchema,
  CareerPreferenceRevisionSchema,
  type CareerPreferenceDraft,
} from "../src/domain/career-preferences.js";
import {
  CompanyResearchDraftSchema,
  CompanyResearchRevisionSchema,
  type CompanyResearchDraft,
} from "../src/domain/company-intelligence.js";
import { CompanySourceSnapshotSchema } from "../src/domain/company-source-acquisition.js";
import {
  JobAnalysisDraftSchema,
  JobOpportunitySchema,
  type JobAnalysisDraft,
} from "../src/domain/job-opportunity.js";
import { JobMatchReportSchema } from "../src/domain/job-match.js";
import { InterviewPlanReportSchema } from "../src/domain/interview-plan.js";
import { EmployerFitReportSchema } from "../src/domain/employer-fit.js";
import { TailoredResumeExportArtifactSchema } from "../src/domain/resume-export.js";
import {
  OpportunityEventSchema,
  OpportunityPipelineItemSchema,
  OpportunityPipelineStatusSchema,
  OpportunityTimelineSchema,
  type OpportunityEventDraft,
} from "../src/domain/opportunity-tracking.js";
import {
  TailoredResumeDraftSchema,
  TailoredResumeRevisionSchema,
  type TailoredResumeDraft,
} from "../src/domain/tailored-resume.js";
import { withCareerStore } from "../src/infrastructure/career-store.js";
import { PdfResumeParser } from "../src/parsers/pdf/pdf-resume-parser.js";
import {
  ParsedResumeDocumentSchema,
  type ParsedResumeDocument,
} from "../src/parsers/contracts.js";
import { resolveWorkspaceFile } from "../src/security/workspace-path.js";

const ResumePathSchema = Type.Object({
  path: Type.String({
    minLength: 1,
    description: "Path to a text-based PDF resume inside the current trusted workspace",
  }),
});

const pdfParser = new PdfResumeParser();

const parseResumePdfTool = defineTool({
  name: "parse_resume_pdf",
  label: "Parse PDF resume",
  description:
    "Deterministically extract text and evidence locations from a text-based PDF resume. " +
    "This tool does not infer or persist candidate facts. Scanned PDFs are not supported.",
  parameters: ResumePathSchema,
  outputSchema: ParsedResumeDocumentSchema,

  async execute(_toolCallId, params, signal, onUpdate, ctx) {
    signal?.throwIfAborted();
    const filePath = await resolveWorkspaceFile(ctx.cwd, params.path);

    onUpdate?.({
      content: [{ type: "text", text: "Reading and validating PDF resume..." }],
      details: { stage: "reading" },
    });

    const bytes = new Uint8Array(await readFile(filePath));
    signal?.throwIfAborted();

    const document = await pdfParser.parse({
      fileName: filePath,
      mimeType: "application/pdf",
      bytes,
    });

    return {
      content: [
        {
          type: "text",
          text: [
            `Parsed ${document.source.fileName}: ${document.source.pageCount} page(s), ${document.blocks.length} evidence block(s).`,
            "Use the JSON document below as the only source for the Candidate Profile draft.",
            JSON.stringify(document),
          ].join("\n\n"),
        },
      ],
      details: {
        fileName: document.source.fileName,
        pageCount: document.source.pageCount,
        blockCount: document.blocks.length,
        quality: document.quality,
      },
      structuredContent: document,
    };
  },
});

const importResumeTool = defineTool({
  name: "import_resume",
  label: "Import resume",
  description:
    "Import a resume through an installed format parser. Version 0.1 accepts text-based PDF files only.",
  parameters: ResumePathSchema,
  outputSchema: ParsedResumeDocumentSchema,

  async execute(_toolCallId, params, signal, onUpdate, ctx) {
    if (!params.path.toLowerCase().endsWith(".pdf")) {
      return {
        content: [
          {
            type: "text",
            text: "Unsupported resume format. Career Steward 0.1 accepts text-based PDF files only.",
          },
        ],
        details: { code: "UNSUPPORTED_RESUME_FORMAT" },
        isError: true,
      };
    }

    const executeOptions = {
      ...(signal ? { signal } : {}),
      ...(onUpdate ? { onUpdate } : {}),
    };
    const outcome = await ctx.executeTool("parse_resume_pdf", params, executeOptions);
    if (outcome.isError) return outcome.result;

    const parsed = outcome.result.structuredContent;
    if (!Value.Check(ParsedResumeDocumentSchema, parsed)) {
      return {
        content: [{ type: "text", text: "PDF parser returned an invalid document contract." }],
        details: { code: "INVALID_PARSER_OUTPUT" },
        isError: true,
      };
    }

    const document = parsed as ParsedResumeDocument;
    withCareerStore(ctx.cwd, (store) => store.saveSourceDocument(document));

    return {
      ...outcome.result,
      content: [
        ...outcome.result.content,
        {
          type: "text",
          text: `Source document saved with id ${document.source.sha256}. Build a profile proposal using only its evidence block ids.`,
        },
      ],
    };
  },
});

const proposeCandidateProfileTool = defineTool({
  name: "propose_candidate_profile",
  label: "Propose Candidate Profile",
  description:
    "Create an evidence-backed Candidate Profile draft from an imported resume. " +
    "Every proposed value must cite one or more block ids returned by import_resume. " +
    "This saves a draft only and never changes the confirmed profile.",
  parameters: CandidateProfileProposalSchema,
  outputSchema: CandidateProfileDraftSchema,

  async execute(_toolCallId, proposal, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const draft = withCareerStore(ctx.cwd, (store) => {
      const document = store.getSourceDocument(proposal.sourceDocumentId);
      if (!document) {
        throw new Error(
          `Source document ${proposal.sourceDocumentId} was not found. Call import_resume first.`,
        );
      }

      const nextDraft = buildCandidateProfileDraft(document, proposal);
      store.saveProfileDraft(nextDraft);
      return nextDraft;
    });

    return {
      content: [
        {
          type: "text",
          text: [
            `Candidate Profile draft ${draft.id} created. It is not confirmed or active.`,
            "Present this draft to the user and wait for explicit confirmation in a later turn.",
            JSON.stringify(draft),
          ].join("\n\n"),
        },
      ],
      details: {
        draftId: draft.id,
        experienceCount: draft.experiences.length,
        skillCount: draft.skills.length,
        warningCount: draft.warnings.length,
      },
      structuredContent: draft,
    };
  },
});

const ConfirmProfileSchema = Type.Object({
  draftId: Type.String({
    minLength: 1,
    description: "Profile draft id previously returned by propose_candidate_profile",
  }),
});

function summarizeDraft(draft: CandidateProfileDraft): string {
  const name = draft.name?.value ?? "未识别姓名";
  return [
    `姓名：${name}`,
    `工作经历：${draft.experiences.length} 条`,
    `技能：${draft.skills.length} 项`,
    `教育经历：${draft.education.length} 条`,
    `待检查警告：${draft.warnings.length} 条`,
  ].join("\n");
}

const confirmCandidateProfileTool = defineTool({
  name: "confirm_candidate_profile",
  label: "Confirm Candidate Profile",
  description:
    "Confirm a reviewed Candidate Profile draft and create the next immutable profile revision. " +
    "Call only after the user explicitly approves the displayed draft. An interactive confirmation is always required.",
  parameters: ConfirmProfileSchema,

  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const draft = withCareerStore(ctx.cwd, (store) => store.getProfileDraft(params.draftId));
    if (!draft) {
      return {
        content: [{ type: "text", text: `Profile draft ${params.draftId} was not found.` }],
        details: { code: "PROFILE_DRAFT_NOT_FOUND" },
        isError: true,
      };
    }

    if (!ctx.hasUI) {
      return {
        content: [
          {
            type: "text",
            text: "Confirming candidate facts requires an interactive Pi UI session.",
          },
        ],
        details: { code: "CONFIRMATION_UI_REQUIRED" },
        isError: true,
      };
    }

    const approved = await ctx.ui.confirm(
      "确认职业档案",
      `${summarizeDraft(draft)}\n\n确认后将创建新的不可变档案版本。`,
      signal ? { signal } : undefined,
    );

    if (!approved) {
      return {
        content: [{ type: "text", text: "Candidate Profile confirmation was cancelled." }],
        details: { confirmed: false, draftId: draft.id },
      };
    }

    const profile = withCareerStore(ctx.cwd, (store) =>
      store.confirmProfileDraft(params.draftId),
    );

    return {
      content: [
        {
          type: "text",
          text: `Candidate Profile revision ${profile.revision} confirmed.\n\n${JSON.stringify(profile)}`,
        },
      ],
      details: {
        confirmed: true,
        draftId: draft.id,
        revision: profile.revision,
      },
      structuredContent: profile,
    };
  },
});

const getCandidateProfileTool = defineTool({
  name: "get_candidate_profile",
  label: "Get Candidate Profile",
  description: "Read the latest confirmed Candidate Profile revision from local storage.",
  parameters: Type.Object({}),

  async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
    const profile = withCareerStore(ctx.cwd, (store) => store.getCurrentProfile());
    if (!profile) {
      return {
        content: [
          {
            type: "text",
            text: "No confirmed Candidate Profile exists yet. Import a resume and review a profile draft first.",
          },
        ],
        details: { found: false },
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Current Candidate Profile revision ${profile.revision}:\n\n${JSON.stringify(profile)}`,
        },
      ],
      details: { found: true, revision: profile.revision },
      structuredContent: profile,
    };
  },
});

function summarizeProfileAmendment(draft: CandidateProfileAmendmentDraft): string {
  const changes = draft.changes.map((change) => {
    const transition = [change.before, change.after].filter(Boolean).join(" → ");
    return `- [${change.kind}] ${change.path}${transition ? `：${transition}` : ""}`;
  });
  return [
    `基于版本：${draft.baseRevision}`,
    `修改原因：${draft.reason}`,
    `变更数量：${draft.changes.length}`,
    ...changes,
  ].join("\n");
}

const proposeCandidateProfileAmendmentTool = defineTool({
  name: "propose_candidate_profile_amendment",
  label: "Propose Candidate Profile Amendment",
  description:
    "Create a non-active, evidence-grounded full-profile amendment draft against the current confirmed revision. " +
    "Every retained or new field must cite existing profile evidence, a real source-resume block, or an explicit user statement.",
  parameters: CandidateProfileAmendmentProposalSchema,
  outputSchema: CandidateProfileAmendmentDraftSchema,

  async execute(_toolCallId, proposal, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const result = withCareerStore(ctx.cwd, (store) => {
      const profile = store.getCurrentProfile();
      if (!profile) return { profile };
      const document = store.getSourceDocument(profile.sourceDocumentId);
      if (!document) return { profile, document };
      const draft = buildCandidateProfileAmendmentDraft(
        profile,
        document,
        proposal,
      );
      store.saveProfileAmendmentDraft(draft);
      return { profile, document, draft };
    });

    if (!result.profile) {
      return {
        content: [
          {
            type: "text",
            text: "No confirmed Candidate Profile exists. Import and confirm a resume first.",
          },
        ],
        details: { code: "CONFIRMED_PROFILE_REQUIRED" },
        isError: true,
      };
    }
    if (!result.document || !result.draft) {
      return {
        content: [
          {
            type: "text",
            text: `Source document ${result.profile.sourceDocumentId} was not found.`,
          },
        ],
        details: { code: "PROFILE_SOURCE_DOCUMENT_NOT_FOUND" },
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: [
            `Candidate Profile amendment draft ${result.draft.id} created. It is not active.`,
            summarizeProfileAmendment(result.draft),
            "Show the complete diff and evidence sources to the user, then wait for explicit approval in a later turn.",
            JSON.stringify(result.draft),
          ].join("\n\n"),
        },
      ],
      details: {
        draftId: result.draft.id,
        baseRevision: result.draft.baseRevision,
        changeCount: result.draft.changes.length,
      },
      structuredContent: result.draft,
    };
  },
});

const ConfirmProfileAmendmentSchema = Type.Object({
  draftId: Type.String({
    minLength: 1,
    description:
      "Profile amendment draft id returned by propose_candidate_profile_amendment",
  }),
});

const confirmCandidateProfileAmendmentTool = defineTool({
  name: "confirm_candidate_profile_amendment",
  label: "Confirm Candidate Profile Amendment",
  description:
    "Confirm a reviewed profile amendment and append the next immutable Candidate Profile revision. " +
    "An interactive confirmation is always required, and stale base revisions are rejected transactionally.",
  parameters: ConfirmProfileAmendmentSchema,
  outputSchema: CandidateProfileRevisionSchema,

  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const draft = withCareerStore(ctx.cwd, (store) =>
      store.getProfileAmendmentDraft(params.draftId),
    );
    if (!draft) {
      return {
        content: [
          {
            type: "text",
            text: `Candidate Profile amendment draft ${params.draftId} was not found.`,
          },
        ],
        details: { code: "PROFILE_AMENDMENT_DRAFT_NOT_FOUND" },
        isError: true,
      };
    }
    if (!ctx.hasUI) {
      return {
        content: [
          {
            type: "text",
            text: "Confirming Candidate Profile facts requires an interactive Pi UI session.",
          },
        ],
        details: { code: "CONFIRMATION_UI_REQUIRED" },
        isError: true,
      };
    }

    const approved = await ctx.ui.confirm(
      "确认职业档案修订",
      `${summarizeProfileAmendment(draft)}\n\n确认后将创建新的不可变档案版本。`,
      signal ? { signal } : undefined,
    );
    if (!approved) {
      return {
        content: [
          { type: "text", text: "Candidate Profile amendment was cancelled." },
        ],
        details: { confirmed: false, draftId: draft.id },
      };
    }

    const profile = withCareerStore(ctx.cwd, (store) =>
      store.confirmProfileAmendmentDraft(draft.id),
    );
    return {
      content: [
        {
          type: "text",
          text: `Candidate Profile revision ${profile.revision} confirmed from amendment ${draft.id}.\n\n${JSON.stringify(profile)}`,
        },
      ],
      details: {
        confirmed: true,
        draftId: draft.id,
        baseRevision: draft.baseRevision,
        revision: profile.revision,
      },
      structuredContent: profile,
    };
  },
});

const listCandidateProfileRevisionsTool = defineTool({
  name: "list_candidate_profile_revisions",
  label: "List Candidate Profile Revisions",
  description:
    "List lightweight summaries of all immutable Candidate Profile revisions, newest first.",
  parameters: Type.Object({}),
  outputSchema: Type.Array(CandidateProfileRevisionSummarySchema),

  async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
    const revisions = withCareerStore(ctx.cwd, (store) =>
      store.listProfileRevisions().map(summarizeCandidateProfileRevision),
    );
    return {
      content: [
        {
          type: "text",
          text: `Found ${revisions.length} Candidate Profile revision(s).\n\n${JSON.stringify(revisions)}`,
        },
      ],
      details: { count: revisions.length },
      structuredContent: revisions,
    };
  },
});

const GetCandidateProfileRevisionSchema = Type.Object({
  revision: Type.Integer({ minimum: 1 }),
});

const getCandidateProfileRevisionTool = defineTool({
  name: "get_candidate_profile_revision",
  label: "Get Candidate Profile Revision",
  description: "Read one immutable Candidate Profile revision by revision number.",
  parameters: GetCandidateProfileRevisionSchema,
  outputSchema: CandidateProfileRevisionSchema,

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const profile = withCareerStore(ctx.cwd, (store) =>
      store.getProfileRevision(params.revision),
    );
    if (!profile) {
      return {
        content: [
          {
            type: "text",
            text: `Candidate Profile revision ${params.revision} was not found.`,
          },
        ],
        details: { code: "PROFILE_REVISION_NOT_FOUND" },
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `Candidate Profile revision ${profile.revision}:\n\n${JSON.stringify(profile)}`,
        },
      ],
      details: {
        found: true,
        revision: profile.revision,
        changeType: profile.change?.type ?? "legacy",
      },
      structuredContent: profile,
    };
  },
});

const createJobOpportunityTool = defineTool({
  name: "create_job_opportunity",
  label: "Create Job Opportunity",
  description:
    "Capture a manually supplied job description and split it into stable evidence blocks. " +
    "This stores raw JD evidence only and does not analyze or score the role.",
  parameters: CreateJobOpportunityInputSchema,
  outputSchema: JobOpportunitySchema,

  async execute(_toolCallId, input, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const opportunity = createJobOpportunity(input);
    withCareerStore(ctx.cwd, (store) => store.saveJobOpportunity(opportunity));

    return {
      content: [
        {
          type: "text",
          text: [
            `Created opportunity ${opportunity.id} for ${opportunity.companyName} — ${opportunity.jobTitle}.`,
            `The JD contains ${opportunity.blocks.length} evidence block(s).`,
            "Use only the block ids below when proposing structured requirements.",
            JSON.stringify(opportunity),
          ].join("\n\n"),
        },
      ],
      details: {
        opportunityId: opportunity.id,
        companyName: opportunity.companyName,
        jobTitle: opportunity.jobTitle,
        blockCount: opportunity.blocks.length,
      },
      structuredContent: opportunity,
    };
  },
});

const proposeJobAnalysisTool = defineTool({
  name: "propose_job_analysis",
  label: "Propose Job Analysis",
  description:
    "Create an evidence-backed job analysis draft for a stored opportunity. " +
    "Every requirement must cite real JD block ids. Inferred requirements also need a rationale and confidence. " +
    "This tool saves a draft only and never activates the analysis.",
  parameters: JobAnalysisProposalSchema,
  outputSchema: JobAnalysisDraftSchema,

  async execute(_toolCallId, proposal, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const draft = withCareerStore(ctx.cwd, (store) => {
      const opportunity = store.getJobOpportunity(proposal.opportunityId);
      if (!opportunity) {
        throw new Error(
          `Job opportunity ${proposal.opportunityId} was not found. Call create_job_opportunity first.`,
        );
      }

      const nextDraft = buildJobAnalysisDraft(opportunity, proposal);
      store.saveJobAnalysisDraft(nextDraft);
      return nextDraft;
    });

    return {
      content: [
        {
          type: "text",
          text: [
            `Job analysis draft ${draft.id} created. It is not confirmed or active.`,
            "Present explicit requirements, inferred requirements, and warnings to the user, then wait for a later turn.",
            JSON.stringify(draft),
          ].join("\n\n"),
        },
      ],
      details: {
        draftId: draft.id,
        opportunityId: draft.opportunityId,
        requirementCount: draft.requirements.length,
        inferredCount: draft.requirements.filter(
          (requirement) => requirement.explicitness === "inferred",
        ).length,
        warningCount: draft.warnings.length,
      },
      structuredContent: draft,
    };
  },
});

const ConfirmJobAnalysisSchema = Type.Object({
  draftId: Type.String({
    minLength: 1,
    description: "Job analysis draft id returned by propose_job_analysis",
  }),
});

function summarizeJobAnalysis(draft: JobAnalysisDraft): string {
  const explicitCount = draft.requirements.filter(
    (requirement) => requirement.explicitness === "explicit",
  ).length;
  const inferredCount = draft.requirements.length - explicitCount;

  return [
    `岗位概要：${draft.roleSummary}`,
    `要求总数：${draft.requirements.length} 条`,
    `JD 明示要求：${explicitCount} 条`,
    `推断要求：${inferredCount} 条`,
    `待检查警告：${draft.warnings.length} 条`,
  ].join("\n");
}

const confirmJobAnalysisTool = defineTool({
  name: "confirm_job_analysis",
  label: "Confirm Job Analysis",
  description:
    "Confirm a reviewed job analysis draft and create an immutable analysis revision. " +
    "Call only after explicit user approval in a later turn. Interactive confirmation is always required.",
  parameters: ConfirmJobAnalysisSchema,

  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const draft = withCareerStore(ctx.cwd, (store) =>
      store.getJobAnalysisDraft(params.draftId),
    );
    if (!draft) {
      return {
        content: [{ type: "text", text: `Job analysis draft ${params.draftId} was not found.` }],
        details: { code: "JOB_ANALYSIS_DRAFT_NOT_FOUND" },
        isError: true,
      };
    }

    if (!ctx.hasUI) {
      return {
        content: [
          {
            type: "text",
            text: "Confirming a job analysis requires an interactive Pi UI session.",
          },
        ],
        details: { code: "CONFIRMATION_UI_REQUIRED" },
        isError: true,
      };
    }

    const approved = await ctx.ui.confirm(
      "确认岗位分析",
      `${summarizeJobAnalysis(draft)}\n\n确认后将创建新的不可变岗位分析版本。`,
      signal ? { signal } : undefined,
    );
    if (!approved) {
      return {
        content: [{ type: "text", text: "Job analysis confirmation was cancelled." }],
        details: { confirmed: false, draftId: draft.id },
      };
    }

    const analysis = withCareerStore(ctx.cwd, (store) =>
      store.confirmJobAnalysisDraft(params.draftId),
    );

    return {
      content: [
        {
          type: "text",
          text: `Job analysis revision ${analysis.revision} confirmed.\n\n${JSON.stringify(analysis)}`,
        },
      ],
      details: {
        confirmed: true,
        draftId: draft.id,
        opportunityId: analysis.opportunityId,
        revision: analysis.revision,
      },
      structuredContent: analysis,
    };
  },
});

const GetJobOpportunitySchema = Type.Object({
  opportunityId: Type.String({ minLength: 1 }),
});

const getJobOpportunityTool = defineTool({
  name: "get_job_opportunity",
  label: "Get Job Opportunity",
  description:
    "Read a stored job opportunity and its latest confirmed analysis revision, when available.",
  parameters: GetJobOpportunitySchema,

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = withCareerStore(ctx.cwd, (store) => ({
      opportunity: store.getJobOpportunity(params.opportunityId),
      analysis: store.getCurrentJobAnalysis(params.opportunityId),
    }));

    if (!result.opportunity) {
      return {
        content: [
          { type: "text", text: `Job opportunity ${params.opportunityId} was not found.` },
        ],
        details: { found: false },
        isError: true,
      };
    }

    const payload = {
      opportunity: result.opportunity,
      ...(result.analysis ? { analysis: result.analysis } : {}),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      details: {
        found: true,
        opportunityId: result.opportunity.id,
        status: result.opportunity.status,
        analysisRevision: result.analysis?.revision,
      },
      structuredContent: payload,
    };
  },
});

const calculateJobMatchTool = defineTool({
  name: "calculate_job_match",
  label: "Calculate Job Match",
  description:
    "Create an immutable, evidence-grounded Match Report from the latest confirmed Candidate Profile " +
    "and confirmed Job Analysis. Supply exactly one semantic mapping for every confirmed requirement. " +
    "Weights, factors, evidence text, and final scores are resolved deterministically by the application.",
  parameters: JobMatchProposalSchema,
  outputSchema: JobMatchReportSchema,

  async execute(_toolCallId, proposal, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const result = withCareerStore(ctx.cwd, (store) => {
      const profile = store.getCurrentProfile();
      const analysis = store.getCurrentJobAnalysis(proposal.opportunityId);
      if (!profile || !analysis) return { profile, analysis };

      const draft = buildJobMatchReportDraft(profile, analysis, proposal, {
        ...(ctx.model?.provider ? { provider: ctx.model.provider } : {}),
        ...(ctx.model?.id ? { modelId: ctx.model.id } : {}),
      });
      return { profile, analysis, report: store.saveJobMatchReport(draft) };
    });

    if (!result.profile) {
      return {
        content: [
          {
            type: "text",
            text: "No confirmed Candidate Profile exists. Confirm a profile before calculating a match.",
          },
        ],
        details: { code: "CONFIRMED_PROFILE_REQUIRED" },
        isError: true,
      };
    }
    if (!result.analysis) {
      return {
        content: [
          {
            type: "text",
            text: `No confirmed Job Analysis exists for opportunity ${proposal.opportunityId}.`,
          },
        ],
        details: { code: "CONFIRMED_JOB_ANALYSIS_REQUIRED" },
        isError: true,
      };
    }

    const report = result.report!;
    return {
      content: [
        {
          type: "text",
          text: [
            `Match Report revision ${report.revision} created with score ${report.metrics.matchScore}.`,
            `Capability ${report.metrics.capabilityScore}; evidence coverage ${report.metrics.evidenceCoverage}; confidence ${report.metrics.confidenceScore}.`,
            "This score measures capability fit only. Employer Fit is evaluated separately.",
            JSON.stringify(report),
          ].join("\n\n"),
        },
      ],
      details: {
        opportunityId: report.opportunityId,
        revision: report.revision,
        profileRevision: report.profileRevision,
        jobAnalysisRevision: report.jobAnalysisRevision,
        matchScore: report.metrics.matchScore,
      },
      structuredContent: report,
    };
  },
});

const getJobMatchTool = defineTool({
  name: "get_job_match",
  label: "Get Job Match",
  description: "Read the latest immutable Match Report revision for a job opportunity.",
  parameters: GetJobOpportunitySchema,
  outputSchema: JobMatchReportSchema,

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const report = withCareerStore(ctx.cwd, (store) =>
      store.getCurrentJobMatch(params.opportunityId),
    );
    if (!report) {
      return {
        content: [
          {
            type: "text",
            text: `No Match Report exists for opportunity ${params.opportunityId}.`,
          },
        ],
        details: { found: false },
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Current Match Report revision ${report.revision}:\n\n${JSON.stringify(report)}`,
        },
      ],
      details: {
        found: true,
        opportunityId: report.opportunityId,
        revision: report.revision,
        matchScore: report.metrics.matchScore,
      },
      structuredContent: report,
    };
  },
});

const fetchCompanySourceTool = defineTool({
  name: "fetch_company_source",
  label: "Fetch Company Source",
  description:
    "Retrieve one public HTTP(S) page as a bounded, auditable company-research source snapshot. " +
    "The tool blocks local/private network access, validates every redirect, does not execute JavaScript, and does not infer source type or company claims.",
  parameters: FetchCompanySourceInputSchema,
  outputSchema: CompanySourceSnapshotSchema,

  async execute(_toolCallId, input, signal, onUpdate) {
    signal?.throwIfAborted();
    onUpdate?.({
      content: [{ type: "text", text: "Fetching and validating public company source..." }],
      details: { stage: "fetching", requestedUrl: input.url },
    });
    try {
      const snapshot = await fetchCompanySource(input, signal);
      return {
        content: [
          {
            type: "text",
            text: [
              `Fetched ${snapshot.finalUrl} (${snapshot.byteLength} bytes, ${snapshot.text.length} normalized characters).`,
              "Use only text present in this snapshot when preparing source excerpts. Classify the source separately and preserve all warnings.",
              JSON.stringify(snapshot),
            ].join("\n\n"),
          },
        ],
        details: {
          finalUrl: snapshot.finalUrl,
          contentSha256: snapshot.contentSha256,
          byteLength: snapshot.byteLength,
          textLength: snapshot.text.length,
          redirectCount: snapshot.redirects.length,
          truncated: snapshot.truncated,
          warningCount: snapshot.warnings.length,
        },
        structuredContent: snapshot,
      };
    } catch (error) {
      if (!(error instanceof CompanySourceFetchError)) throw error;
      return {
        content: [{ type: "text", text: error.message }],
        details: { code: error.code, requestedUrl: input.url },
        isError: true,
      };
    }
  },
});

const proposeCompanyResearchTool = defineTool({
  name: "propose_company_research",
  label: "Propose Company Research",
  description:
    "Create a source-tiered company research draft for a stored opportunity. " +
    "Official facts, professional reporting, community sentiment, award records, and model inferences remain distinguishable. " +
    "This saves a draft only; it does not confirm claims or calculate Employer Fit.",
  parameters: CompanyResearchProposalSchema,
  outputSchema: CompanyResearchDraftSchema,

  async execute(_toolCallId, proposal, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const draft = withCareerStore(ctx.cwd, (store) => {
      const opportunity = store.getJobOpportunity(proposal.opportunityId);
      if (!opportunity) {
        throw new Error(
          `Job opportunity ${proposal.opportunityId} was not found. Create it before company research.`,
        );
      }
      const nextDraft = buildCompanyResearchDraft(opportunity, proposal);
      store.saveCompanyResearchDraft(nextDraft);
      return nextDraft;
    });

    const missingCategories = draft.coverage
      .filter((item) => item.status === "missing")
      .map((item) => item.category);
    return {
      content: [
        {
          type: "text",
          text: [
            `Company research draft ${draft.id} created for ${draft.companyName}. It is not confirmed.`,
            `Sources: ${draft.sources.length}; claims: ${draft.claims.length}; missing categories: ${missingCategories.join(", ") || "none"}.`,
            "Show source tiers, claim bases, conflicting signals, coverage gaps, and warnings to the user. Wait for explicit approval in a later turn.",
            JSON.stringify(draft),
          ].join("\n\n"),
        },
      ],
      details: {
        draftId: draft.id,
        opportunityId: draft.opportunityId,
        sourceCount: draft.sources.length,
        claimCount: draft.claims.length,
        missingCategories,
      },
      structuredContent: draft,
    };
  },
});

const ConfirmCompanyResearchSchema = Type.Object({
  draftId: Type.String({
    minLength: 1,
    description: "Company research draft id returned by propose_company_research",
  }),
});

function summarizeCompanyResearch(draft: CompanyResearchDraft): string {
  const sourceCounts = new Map<string, number>();
  for (const source of draft.sources) {
    sourceCounts.set(source.sourceType, (sourceCounts.get(source.sourceType) ?? 0) + 1);
  }
  const missing = draft.coverage
    .filter((item) => item.status === "missing")
    .map((item) => item.category);
  return [
    `公司：${draft.companyName}`,
    `来源：${[...sourceCounts].map(([type, count]) => `${type} ${count}`).join("；")}`,
    `结论：${draft.claims.length} 条`,
    `缺失主题：${missing.join("、") || "无"}`,
    `警告：${draft.warnings.length} 条`,
  ].join("\n");
}

const confirmCompanyResearchTool = defineTool({
  name: "confirm_company_research",
  label: "Confirm Company Research",
  description:
    "Confirm a reviewed company research draft and create an immutable revision. " +
    "Call only after explicit user approval in a later turn. Interactive confirmation is required.",
  parameters: ConfirmCompanyResearchSchema,
  outputSchema: CompanyResearchRevisionSchema,

  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const draft = withCareerStore(ctx.cwd, (store) =>
      store.getCompanyResearchDraft(params.draftId),
    );
    if (!draft) {
      return {
        content: [
          { type: "text", text: `Company research draft ${params.draftId} was not found.` },
        ],
        details: { code: "COMPANY_RESEARCH_DRAFT_NOT_FOUND" },
        isError: true,
      };
    }
    if (!ctx.hasUI) {
      return {
        content: [
          { type: "text", text: "Confirming company research requires an interactive Pi UI session." },
        ],
        details: { code: "CONFIRMATION_UI_REQUIRED" },
        isError: true,
      };
    }

    const approved = await ctx.ui.confirm(
      "确认公司情报",
      `${summarizeCompanyResearch(draft)}\n\n确认后将创建不可变研究版本。`,
      signal ? { signal } : undefined,
    );
    if (!approved) {
      return {
        content: [{ type: "text", text: "Company research confirmation was cancelled." }],
        details: { confirmed: false, draftId: draft.id },
      };
    }

    const research = withCareerStore(ctx.cwd, (store) =>
      store.confirmCompanyResearchDraft(params.draftId),
    );
    return {
      content: [
        {
          type: "text",
          text: `Company research revision ${research.revision} confirmed.\n\n${JSON.stringify(research)}`,
        },
      ],
      details: {
        confirmed: true,
        opportunityId: research.opportunityId,
        revision: research.revision,
      },
      structuredContent: research,
    };
  },
});

const getCompanyResearchTool = defineTool({
  name: "get_company_research",
  label: "Get Company Research",
  description: "Read the latest confirmed company research revision for an opportunity.",
  parameters: GetJobOpportunitySchema,
  outputSchema: CompanyResearchRevisionSchema,

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const research = withCareerStore(ctx.cwd, (store) =>
      store.getCurrentCompanyResearch(params.opportunityId),
    );
    if (!research) {
      return {
        content: [
          {
            type: "text",
            text: `No confirmed company research exists for opportunity ${params.opportunityId}.`,
          },
        ],
        details: { found: false },
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `Current company research revision ${research.revision}:\n\n${JSON.stringify(research)}`,
        },
      ],
      details: {
        found: true,
        opportunityId: research.opportunityId,
        revision: research.revision,
      },
      structuredContent: research,
    };
  },
});

const proposeCareerPreferencesTool = defineTool({
  name: "propose_career_preferences",
  label: "Propose Career Preferences",
  description:
    "Create a draft of the user's employer preferences, importance weights, and deal breakers. " +
    "This saves a draft only. The model must not silently confirm preferences on the user's behalf.",
  parameters: CareerPreferenceProposalSchema,
  outputSchema: CareerPreferenceDraftSchema,

  async execute(_toolCallId, proposal, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const draft = buildCareerPreferenceDraft(proposal);
    withCareerStore(ctx.cwd, (store) => store.saveCareerPreferenceDraft(draft));
    return {
      content: [
        {
          type: "text",
          text: [
            `Career preference draft ${draft.id} created. It is not confirmed.`,
            "Show every importance weight and deal breaker to the user, then wait for explicit approval in a later turn.",
            JSON.stringify(draft),
          ].join("\n\n"),
        },
      ],
      details: {
        draftId: draft.id,
        preferenceCount: draft.employerPreferences.length,
        dealBreakerCount: draft.employerPreferences.filter((item) => item.dealBreaker).length,
      },
      structuredContent: draft,
    };
  },
});

const ConfirmCareerPreferencesSchema = Type.Object({
  draftId: Type.String({
    minLength: 1,
    description: "Career preference draft id returned by propose_career_preferences",
  }),
});

function summarizeCareerPreferences(draft: CareerPreferenceDraft): string {
  return draft.employerPreferences
    .map(
      (item) =>
        `${item.dimension}：重要度 ${item.importance}/5${item.dealBreaker ? "；不可妥协" : ""}\n  ${item.desiredOutcome}`,
    )
    .join("\n");
}

const confirmCareerPreferencesTool = defineTool({
  name: "confirm_career_preferences",
  label: "Confirm Career Preferences",
  description:
    "Confirm reviewed employer preferences and create an immutable preference revision. " +
    "Interactive user confirmation is always required.",
  parameters: ConfirmCareerPreferencesSchema,
  outputSchema: CareerPreferenceRevisionSchema,

  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const draft = withCareerStore(ctx.cwd, (store) =>
      store.getCareerPreferenceDraft(params.draftId),
    );
    if (!draft) {
      return {
        content: [
          { type: "text", text: `Career preference draft ${params.draftId} was not found.` },
        ],
        details: { code: "CAREER_PREFERENCE_DRAFT_NOT_FOUND" },
        isError: true,
      };
    }
    if (!ctx.hasUI) {
      return {
        content: [
          { type: "text", text: "Confirming career preferences requires an interactive Pi UI session." },
        ],
        details: { code: "CONFIRMATION_UI_REQUIRED" },
        isError: true,
      };
    }
    const approved = await ctx.ui.confirm(
      "确认雇主偏好",
      `${summarizeCareerPreferences(draft)}\n\n确认后将创建新的不可变偏好版本。`,
      signal ? { signal } : undefined,
    );
    if (!approved) {
      return {
        content: [{ type: "text", text: "Career preference confirmation was cancelled." }],
        details: { confirmed: false, draftId: draft.id },
      };
    }

    const preferences = withCareerStore(ctx.cwd, (store) =>
      store.confirmCareerPreferenceDraft(params.draftId),
    );
    return {
      content: [
        {
          type: "text",
          text: `Career preference revision ${preferences.revision} confirmed.\n\n${JSON.stringify(preferences)}`,
        },
      ],
      details: { confirmed: true, revision: preferences.revision },
      structuredContent: preferences,
    };
  },
});

const getCareerPreferencesTool = defineTool({
  name: "get_career_preferences",
  label: "Get Career Preferences",
  description: "Read the latest confirmed employer preference revision.",
  parameters: Type.Object({}),
  outputSchema: CareerPreferenceRevisionSchema,

  async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
    const preferences = withCareerStore(ctx.cwd, (store) =>
      store.getCurrentCareerPreferences(),
    );
    if (!preferences) {
      return {
        content: [
          { type: "text", text: "No confirmed career preference revision exists yet." },
        ],
        details: { found: false },
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `Current career preference revision ${preferences.revision}:\n\n${JSON.stringify(preferences)}`,
        },
      ],
      details: { found: true, revision: preferences.revision },
      structuredContent: preferences,
    };
  },
});

const calculateEmployerFitTool = defineTool({
  name: "calculate_employer_fit",
  label: "Calculate Employer Fit",
  description:
    "Create an immutable Employer Fit report from the latest confirmed career preferences and company research. " +
    "Supply exactly one semantic mapping per preference. Scores and caps are calculated deterministically.",
  parameters: EmployerFitProposalSchema,
  outputSchema: EmployerFitReportSchema,

  async execute(_toolCallId, proposal, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const result = withCareerStore(ctx.cwd, (store) => {
      const preferences = store.getCurrentCareerPreferences();
      const research = store.getCurrentCompanyResearch(proposal.opportunityId);
      if (!preferences || !research) return { preferences, research };
      const draft = buildEmployerFitReportDraft(preferences, research, proposal, {
        ...(ctx.model?.provider ? { provider: ctx.model.provider } : {}),
        ...(ctx.model?.id ? { modelId: ctx.model.id } : {}),
      });
      return { preferences, research, report: store.saveEmployerFitReport(draft) };
    });

    if (!result.preferences) {
      return {
        content: [
          { type: "text", text: "No confirmed career preferences exist. Confirm them before calculating Employer Fit." },
        ],
        details: { code: "CONFIRMED_CAREER_PREFERENCES_REQUIRED" },
        isError: true,
      };
    }
    if (!result.research) {
      return {
        content: [
          { type: "text", text: `No confirmed company research exists for opportunity ${proposal.opportunityId}.` },
        ],
        details: { code: "CONFIRMED_COMPANY_RESEARCH_REQUIRED" },
        isError: true,
      };
    }

    const report = result.report!;
    return {
      content: [
        {
          type: "text",
          text: [
            `Employer Fit revision ${report.revision} created with score ${report.metrics.employerFitScore}.`,
            `Alignment ${report.metrics.alignmentScore}; evidence coverage ${report.metrics.evidenceCoverage}; confidence ${report.metrics.confidenceScore}.`,
            "Employer Fit is independent from the capability Match Report.",
            JSON.stringify(report),
          ].join("\n\n"),
        },
      ],
      details: {
        opportunityId: report.opportunityId,
        revision: report.revision,
        preferenceRevision: report.preferenceRevision,
        companyResearchRevision: report.companyResearchRevision,
        employerFitScore: report.metrics.employerFitScore,
      },
      structuredContent: report,
    };
  },
});

const getEmployerFitTool = defineTool({
  name: "get_employer_fit",
  label: "Get Employer Fit",
  description: "Read the latest immutable Employer Fit report for an opportunity.",
  parameters: GetJobOpportunitySchema,
  outputSchema: EmployerFitReportSchema,

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const report = withCareerStore(ctx.cwd, (store) =>
      store.getCurrentEmployerFit(params.opportunityId),
    );
    if (!report) {
      return {
        content: [
          { type: "text", text: `No Employer Fit report exists for opportunity ${params.opportunityId}.` },
        ],
        details: { found: false },
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `Current Employer Fit revision ${report.revision}:\n\n${JSON.stringify(report)}`,
        },
      ],
      details: {
        found: true,
        opportunityId: report.opportunityId,
        revision: report.revision,
        employerFitScore: report.metrics.employerFitScore,
      },
      structuredContent: report,
    };
  },
});

const proposeTailoredResumeTool = defineTool({
  name: "propose_tailored_resume",
  label: "Propose Tailored Resume",
  description:
    "Build an evidence-grounded, ATS-compatible Markdown CV draft from the latest confirmed profile, job analysis, and current Match Report. " +
    "Every generated statement must cite matched candidate evidence and requirements. This tool never confirms the CV.",
  parameters: TailoredResumeProposalSchema,
  outputSchema: TailoredResumeDraftSchema,

  async execute(_toolCallId, proposal, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const result = withCareerStore(ctx.cwd, (store) => {
      const profile = store.getCurrentProfile();
      const opportunity = store.getJobOpportunity(proposal.opportunityId);
      const analysis = store.getCurrentJobAnalysis(proposal.opportunityId);
      const match = store.getCurrentJobMatch(proposal.opportunityId);
      if (!profile || !opportunity || !analysis || !match) {
        return { profile, opportunity, analysis, match };
      }
      const draft = buildTailoredResumeDraft(
        profile,
        opportunity,
        analysis,
        match,
        proposal,
      );
      store.saveTailoredResumeDraft(draft);
      return { profile, opportunity, analysis, match, draft };
    });

    if (!result.profile) {
      return {
        content: [{ type: "text", text: "No confirmed Candidate Profile exists." }],
        details: { code: "CONFIRMED_PROFILE_REQUIRED" },
        isError: true,
      };
    }
    if (!result.opportunity || !result.analysis) {
      return {
        content: [
          { type: "text", text: `A stored opportunity and confirmed Job Analysis are required for ${proposal.opportunityId}.` },
        ],
        details: { code: "CONFIRMED_JOB_ANALYSIS_REQUIRED" },
        isError: true,
      };
    }
    if (!result.match) {
      return {
        content: [
          { type: "text", text: `A current Match Report is required for opportunity ${proposal.opportunityId}.` },
        ],
        details: { code: "CURRENT_MATCH_REPORT_REQUIRED" },
        isError: true,
      };
    }

    const draft = result.draft!;
    const failedChecks = draft.atsChecks.filter((check) => !check.passed);
    return {
      content: [
        {
          type: "text",
          text: [
            `Tailored CV draft ${draft.id} created. It is not confirmed.`,
            `Requirement coverage: ${draft.requirementCoverage.coverageScore}; ATS checks needing review: ${failedChecks.length}; warnings: ${draft.warnings.length}.`,
            "Present the Markdown, uncovered requirements, ATS checks, and warnings. Wait for explicit approval in a later turn.",
            draft.markdown,
            JSON.stringify(draft),
          ].join("\n\n"),
        },
      ],
      details: {
        draftId: draft.id,
        opportunityId: draft.opportunityId,
        coverageScore: draft.requirementCoverage.coverageScore,
        failedCheckCount: failedChecks.length,
        warningCount: draft.warnings.length,
      },
      structuredContent: draft,
    };
  },
});

const ConfirmTailoredResumeSchema = Type.Object({
  draftId: Type.String({
    minLength: 1,
    description: "Tailored CV draft id returned by propose_tailored_resume",
  }),
});

function summarizeTailoredResume(draft: TailoredResumeDraft): string {
  const failedChecks = draft.atsChecks.filter((check) => !check.passed);
  return [
    `目标：${draft.companyName} — ${draft.targetJobTitle}`,
    `需求覆盖：${draft.requirementCoverage.coverageScore}/100`,
    `经历段：${draft.experiences.length} 条`,
    `技能：${draft.skills.length} 项`,
    `ATS 待检查：${failedChecks.length} 项`,
    `风险提示：${draft.warnings.length} 条`,
  ].join("\n");
}

const confirmTailoredResumeTool = defineTool({
  name: "confirm_tailored_resume",
  label: "Confirm Tailored Resume",
  description:
    "Confirm a reviewed tailored Markdown CV draft and create an immutable revision. " +
    "Interactive user confirmation is always required.",
  parameters: ConfirmTailoredResumeSchema,
  outputSchema: TailoredResumeRevisionSchema,

  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const draft = withCareerStore(ctx.cwd, (store) =>
      store.getTailoredResumeDraft(params.draftId),
    );
    if (!draft) {
      return {
        content: [
          { type: "text", text: `Tailored CV draft ${params.draftId} was not found.` },
        ],
        details: { code: "TAILORED_RESUME_DRAFT_NOT_FOUND" },
        isError: true,
      };
    }
    if (!ctx.hasUI) {
      return {
        content: [
          { type: "text", text: "Confirming a tailored CV requires an interactive Pi UI session." },
        ],
        details: { code: "CONFIRMATION_UI_REQUIRED" },
        isError: true,
      };
    }
    const approved = await ctx.ui.confirm(
      "确认定制 CV",
      `${summarizeTailoredResume(draft)}\n\n确认前请确保已经审阅完整 Markdown 和全部风险提示。`,
      signal ? { signal } : undefined,
    );
    if (!approved) {
      return {
        content: [{ type: "text", text: "Tailored CV confirmation was cancelled." }],
        details: { confirmed: false, draftId: draft.id },
      };
    }

    const resume = withCareerStore(ctx.cwd, (store) =>
      store.confirmTailoredResumeDraft(params.draftId),
    );
    return {
      content: [
        {
          type: "text",
          text: `Tailored CV revision ${resume.revision} confirmed.\n\n${resume.markdown}\n\n${JSON.stringify(resume)}`,
        },
      ],
      details: {
        confirmed: true,
        opportunityId: resume.opportunityId,
        revision: resume.revision,
      },
      structuredContent: resume,
    };
  },
});

const getTailoredResumeTool = defineTool({
  name: "get_tailored_resume",
  label: "Get Tailored Resume",
  description: "Read the latest confirmed tailored CV revision for an opportunity.",
  parameters: GetJobOpportunitySchema,
  outputSchema: TailoredResumeRevisionSchema,

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const resume = withCareerStore(ctx.cwd, (store) =>
      store.getCurrentTailoredResume(params.opportunityId),
    );
    if (!resume) {
      return {
        content: [
          { type: "text", text: `No confirmed tailored CV exists for opportunity ${params.opportunityId}.` },
        ],
        details: { found: false },
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `Current tailored CV revision ${resume.revision}:\n\n${resume.markdown}\n\n${JSON.stringify(resume)}`,
        },
      ],
      details: {
        found: true,
        opportunityId: resume.opportunityId,
        revision: resume.revision,
        coverageScore: resume.requirementCoverage.coverageScore,
      },
      structuredContent: resume,
    };
  },
});

const exportTailoredResumeTool = defineTool({
  name: "export_tailored_resume",
  label: "Export Tailored Resume",
  description:
    "Export the latest confirmed tailored CV revision as canonical Markdown or an ATS-compatible single-column DOCX. " +
    "This tool cannot change CV content and never overwrites an existing file.",
  parameters: ExportTailoredResumeInputSchema,
  outputSchema: TailoredResumeExportArtifactSchema,

  async execute(_toolCallId, input, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const resume = withCareerStore(ctx.cwd, (store) =>
      store.getCurrentTailoredResume(input.opportunityId),
    );
    if (!resume) {
      return {
        content: [
          {
            type: "text",
            text: `No confirmed tailored CV exists for opportunity ${input.opportunityId}.`,
          },
        ],
        details: { code: "CONFIRMED_TAILORED_RESUME_REQUIRED" },
        isError: true,
      };
    }

    const artifact = await exportTailoredResume(resume, ctx.cwd, input);
    signal?.throwIfAborted();
    return {
      content: [
        {
          type: "text",
          text: [
            `Exported confirmed tailored CV revision ${artifact.resumeRevision} as ${artifact.format}.`,
            `Workspace path: ${artifact.relativePath}`,
            `SHA-256: ${artifact.sha256}`,
            JSON.stringify(artifact),
          ].join("\n\n"),
        },
      ],
      details: {
        opportunityId: artifact.opportunityId,
        resumeRevision: artifact.resumeRevision,
        format: artifact.format,
        relativePath: artifact.relativePath,
        byteLength: artifact.byteLength,
      },
      structuredContent: artifact,
    };
  },
});

const createInterviewPlanTool = defineTool({
  name: "create_interview_plan",
  label: "Create Interview Plan",
  description:
    "Create an immutable, evidence-grounded interview preparation plan from the latest confirmed profile, job analysis, and current Match Report. " +
    "The plan must cover every requirement and may use confirmed company claims for neutral reverse-interview questions.",
  parameters: InterviewPlanProposalSchema,
  outputSchema: InterviewPlanReportSchema,

  async execute(_toolCallId, proposal, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const result = withCareerStore(ctx.cwd, (store) => {
      const profile = store.getCurrentProfile();
      const opportunity = store.getJobOpportunity(proposal.opportunityId);
      const analysis = store.getCurrentJobAnalysis(proposal.opportunityId);
      const match = store.getCurrentJobMatch(proposal.opportunityId);
      const research = store.getCurrentCompanyResearch(proposal.opportunityId);
      if (!profile || !opportunity || !analysis || !match) {
        return { profile, opportunity, analysis, match, research };
      }
      const draft = buildInterviewPlanReportDraft(
        profile,
        opportunity,
        analysis,
        match,
        research,
        proposal,
        {
          ...(ctx.model?.provider ? { provider: ctx.model.provider } : {}),
          ...(ctx.model?.id ? { modelId: ctx.model.id } : {}),
        },
      );
      return {
        profile,
        opportunity,
        analysis,
        match,
        research,
        report: store.saveInterviewPlanReport(draft),
      };
    });

    if (!result.profile) {
      return {
        content: [{ type: "text", text: "No confirmed Candidate Profile exists." }],
        details: { code: "CONFIRMED_PROFILE_REQUIRED" },
        isError: true,
      };
    }
    if (!result.opportunity || !result.analysis) {
      return {
        content: [
          { type: "text", text: `A stored opportunity and confirmed Job Analysis are required for ${proposal.opportunityId}.` },
        ],
        details: { code: "CONFIRMED_JOB_ANALYSIS_REQUIRED" },
        isError: true,
      };
    }
    if (!result.match) {
      return {
        content: [
          { type: "text", text: `A current Match Report is required for opportunity ${proposal.opportunityId}.` },
        ],
        details: { code: "CURRENT_MATCH_REPORT_REQUIRED" },
        isError: true,
      };
    }

    const report = result.report!;
    return {
      content: [
        {
          type: "text",
          text: [
            `Interview Plan revision ${report.revision} created for ${report.companyName} — ${report.jobTitle}.`,
            `Requirements: ${report.metrics.requirementCount}; risks: ${report.metrics.riskItemCount}; STAR stories: ${report.metrics.starStoryCount}; schedule: ${report.metrics.scheduledDays} day(s), ${report.metrics.totalMinutes} minutes.`,
            "This is a derived practice artifact. STAR wording must not be reused as Candidate Profile or CV evidence.",
            JSON.stringify(report),
          ].join("\n\n"),
        },
      ],
      details: {
        opportunityId: report.opportunityId,
        revision: report.revision,
        requirementCount: report.metrics.requirementCount,
        riskItemCount: report.metrics.riskItemCount,
        starStoryCount: report.metrics.starStoryCount,
        scheduledDays: report.metrics.scheduledDays,
        totalMinutes: report.metrics.totalMinutes,
      },
      structuredContent: report,
    };
  },
});

const getInterviewPlanTool = defineTool({
  name: "get_interview_plan",
  label: "Get Interview Plan",
  description: "Read the latest immutable Interview Plan revision for an opportunity.",
  parameters: GetJobOpportunitySchema,
  outputSchema: InterviewPlanReportSchema,

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const report = withCareerStore(ctx.cwd, (store) =>
      store.getCurrentInterviewPlan(params.opportunityId),
    );
    if (!report) {
      return {
        content: [
          { type: "text", text: `No Interview Plan exists for opportunity ${params.opportunityId}.` },
        ],
        details: { found: false },
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `Current Interview Plan revision ${report.revision}:\n\n${JSON.stringify(report)}`,
        },
      ],
      details: {
        found: true,
        opportunityId: report.opportunityId,
        revision: report.revision,
        scheduledDays: report.metrics.scheduledDays,
        totalMinutes: report.metrics.totalMinutes,
      },
      structuredContent: report,
    };
  },
});

function summarizeOpportunityEvent(draft: OpportunityEventDraft): string {
  return [
    `事件：${draft.eventType}`,
    `状态变化：${draft.fromStatus} → ${draft.toStatus}`,
    `发生时间：${draft.happenedAt}`,
    ...(draft.interview
      ? [
          `面试时间：${draft.interview.scheduledFor}`,
          `面试轮次：${draft.interview.round}`,
          ...(draft.interview.format ? [`面试形式：${draft.interview.format}`] : []),
        ]
      : []),
    ...(draft.note ? [`备注：${draft.note}`] : []),
  ].join("\n");
}

const recordOpportunityEventTool = defineTool({
  name: "record_opportunity_event",
  label: "Record Opportunity Event",
  description:
    "Prepare and, after mandatory interactive confirmation, append one immutable application-pipeline event. " +
    "Never infer a state change from a JD, match report, email, or calendar item without explicit user confirmation.",
  parameters: RecordOpportunityEventInputSchema,
  outputSchema: OpportunityEventSchema,

  async execute(_toolCallId, input, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const result = withCareerStore(ctx.cwd, (store) => {
      const opportunity = store.getJobOpportunity(input.opportunityId);
      if (!opportunity) return { opportunity };
      const draft = buildOpportunityEventDraft(
        opportunity,
        store.getOpportunityEvents(opportunity.id),
        input,
      );
      return { opportunity, draft };
    });

    if (!result.opportunity || !result.draft) {
      return {
        content: [
          {
            type: "text",
            text: `Job opportunity ${input.opportunityId} was not found.`,
          },
        ],
        details: { code: "JOB_OPPORTUNITY_NOT_FOUND" },
        isError: true,
      };
    }
    if (!ctx.hasUI) {
      return {
        content: [
          {
            type: "text",
            text: "Recording an opportunity event requires an interactive Pi UI session.",
          },
        ],
        details: { code: "CONFIRMATION_UI_REQUIRED" },
        isError: true,
      };
    }

    const approved = await ctx.ui.confirm(
      "确认求职进展",
      `${result.opportunity.companyName} — ${result.opportunity.jobTitle}\n\n${summarizeOpportunityEvent(result.draft)}\n\n确认后将追加一条不可变事件。`,
      signal ? { signal } : undefined,
    );
    if (!approved) {
      return {
        content: [{ type: "text", text: "Opportunity event recording was cancelled." }],
        details: { confirmed: false, opportunityId: result.opportunity.id },
      };
    }

    const event = withCareerStore(ctx.cwd, (store) =>
      store.appendOpportunityEvent(result.draft!),
    );
    return {
      content: [
        {
          type: "text",
          text: `Recorded opportunity event #${event.sequence}: ${event.eventType} (${event.fromStatus} → ${event.toStatus}).\n\n${JSON.stringify(event)}`,
        },
      ],
      details: {
        confirmed: true,
        opportunityId: event.opportunityId,
        sequence: event.sequence,
        pipelineStatus: event.toStatus,
      },
      structuredContent: event,
    };
  },
});

const getOpportunityTimelineTool = defineTool({
  name: "get_opportunity_timeline",
  label: "Get Opportunity Timeline",
  description:
    "Read the immutable event timeline and derived current pipeline status for one opportunity.",
  parameters: GetJobOpportunitySchema,
  outputSchema: OpportunityTimelineSchema,

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = withCareerStore(ctx.cwd, (store) => {
      const opportunity = store.getJobOpportunity(params.opportunityId);
      if (!opportunity) return undefined;
      return buildOpportunityTimeline(
        opportunity,
        store.getOpportunityEvents(opportunity.id),
      );
    });
    if (!result) {
      return {
        content: [
          {
            type: "text",
            text: `Job opportunity ${params.opportunityId} was not found.`,
          },
        ],
        details: { code: "JOB_OPPORTUNITY_NOT_FOUND" },
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `Opportunity is ${result.currentStatus} with ${result.events.length} recorded event(s).\n\n${JSON.stringify(result)}`,
        },
      ],
      details: {
        opportunityId: result.opportunity.id,
        pipelineStatus: result.currentStatus,
        eventCount: result.events.length,
      },
      structuredContent: result,
    };
  },
});

const ListOpportunityPipelineSchema = Type.Object({
  status: Type.Optional(OpportunityPipelineStatusSchema),
});

const listOpportunityPipelineTool = defineTool({
  name: "list_opportunity_pipeline",
  label: "List Opportunity Pipeline",
  description:
    "List all stored opportunities with separate analysis and derived application-pipeline statuses. Optionally filter by pipeline status.",
  parameters: ListOpportunityPipelineSchema,
  outputSchema: Type.Array(OpportunityPipelineItemSchema),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const items = withCareerStore(ctx.cwd, (store) =>
      store
        .listJobOpportunities()
        .map((opportunity) =>
          buildOpportunityPipelineItem(
            opportunity,
            store.getOpportunityEvents(opportunity.id),
          ),
        )
        .filter((item) => !params.status || item.pipelineStatus === params.status)
        .sort((left, right) =>
          (right.lastEventAt ?? "").localeCompare(left.lastEventAt ?? "") ||
          left.companyName.localeCompare(right.companyName),
        ),
    );

    return {
      content: [
        {
          type: "text",
          text: `Found ${items.length} opportunity pipeline item(s).\n\n${JSON.stringify(items)}`,
        },
      ],
      details: { count: items.length, ...(params.status ? { status: params.status } : {}) },
      structuredContent: items,
    };
  },
});

const createCareerDataBackupTool = defineTool({
  name: "create_career_data_backup",
  label: "Create Career Data Backup",
  description:
    "Create a consistent, non-overwriting SQLite backup of all Career Steward data inside the trusted workspace. " +
    "The default destination is career-steward-backups/.",
  parameters: CreateCareerDataBackupInputSchema,
  outputSchema: CareerDataBackupArtifactSchema,

  async execute(_toolCallId, input, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const artifact = await createCareerDataBackup(ctx.cwd, input);
    return {
      content: [
        {
          type: "text",
          text: [
            "Career Steward backup created.",
            `Path: ${artifact.relativePath}`,
            `Schema: ${artifact.schemaVersion}`,
            `Bytes: ${artifact.byteLength}`,
            `SHA-256: ${artifact.sha256}`,
          ].join("\n"),
        },
      ],
      details: artifact,
      structuredContent: artifact,
    };
  },
});

const restoreCareerDataBackupTool = defineTool({
  name: "restore_career_data_backup",
  label: "Restore Career Data Backup",
  description:
    "Inspect and, after mandatory interactive confirmation, restore a Career Steward SQLite backup. " +
    "The current database is automatically preserved as a pre-restore safety backup.",
  parameters: RestoreCareerDataBackupInputSchema,
  outputSchema: CareerDataRestoreResultSchema,

  async execute(_toolCallId, input, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const candidate = await inspectCareerDataBackup(ctx.cwd, input.backupPath);
    if (!ctx.hasUI) {
      return {
        content: [
          {
            type: "text",
            text: "Restoring Career Steward data requires an interactive Pi UI session.",
          },
        ],
        details: { code: "CONFIRMATION_UI_REQUIRED", candidate },
        isError: true,
      };
    }

    const approved = await ctx.ui.confirm(
      "确认恢复 Career Steward 数据",
      [
        `备份：${candidate.relativePath}`,
        `Schema：${candidate.schemaVersion}`,
        `大小：${candidate.byteLength} bytes`,
        `SHA-256：${candidate.sha256}`,
        "",
        "恢复将替换当前数据。系统会先自动创建 pre-restore 安全备份。",
      ].join("\n"),
      signal ? { signal } : undefined,
    );
    if (!approved) {
      return {
        content: [{ type: "text", text: "Career Steward restore was cancelled." }],
        details: { confirmed: false, candidate },
      };
    }

    const result = await restoreCareerDataBackup(
      ctx.cwd,
      input,
      candidate.sha256,
    );
    return {
      content: [
        {
          type: "text",
          text: [
            `Restored Career Steward data from ${result.restoredFrom}.`,
            `Schema: ${result.sourceSchemaVersion} → ${result.restoredSchemaVersion}`,
            `Pre-restore safety backup: ${result.safetyBackup.relativePath}`,
          ].join("\n"),
        },
      ],
      details: { confirmed: true, ...result },
      structuredContent: result,
    };
  },
});

function loadCareerDashboard(workspace: string): CareerDashboard {
  return withCareerStore(workspace, (store) => {
    const profile = store.getCurrentProfile();
    const preferences = store.getCurrentCareerPreferences();
    const opportunities = store.listJobOpportunities().map((opportunity) => {
      const jobAnalysis = store.getCurrentJobAnalysis(opportunity.id);
      const jobMatch = store.getCurrentJobMatch(opportunity.id);
      const companyResearch = store.getCurrentCompanyResearch(opportunity.id);
      const employerFit = store.getCurrentEmployerFit(opportunity.id);
      const tailoredResume = store.getCurrentTailoredResume(opportunity.id);
      const interviewPlan = store.getCurrentInterviewPlan(opportunity.id);
      return {
        opportunity,
        events: store.getOpportunityEvents(opportunity.id),
        ...(jobAnalysis ? { jobAnalysis } : {}),
        ...(jobMatch ? { jobMatch } : {}),
        ...(companyResearch ? { companyResearch } : {}),
        ...(employerFit ? { employerFit } : {}),
        ...(tailoredResume ? { tailoredResume } : {}),
        ...(interviewPlan ? { interviewPlan } : {}),
      };
    });
    return buildCareerDashboard({
      ...(profile ? { profile } : {}),
      ...(preferences ? { preferences } : {}),
      pendingConfirmations: store.listPendingConfirmations(),
      opportunities,
    });
  });
}

const getCareerDashboardTool = defineTool({
  name: "get_career_dashboard",
  label: "Get Career Dashboard",
  description:
    "Return a read-only projection of Candidate Profile health, application pipeline counts, pending confirmations, recent activity, and deterministic next-action suggestions. It never confirms drafts or changes opportunity status.",
  parameters: Type.Object({}),
  outputSchema: CareerDashboardSchema,

  async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
    const dashboard = loadCareerDashboard(ctx.cwd);
    return {
      content: [{ type: "text", text: formatCareerDashboard(dashboard) }],
      details: {
        opportunityCount: dashboard.opportunityCount,
        pendingConfirmationCount: dashboard.pendingConfirmations.length,
        nextActionCount: dashboard.nextActions.length,
      },
      structuredContent: dashboard,
    };
  },
});

export default function careerStewardExtension(pi: ExtensionAPI) {
  pi.registerTool(parseResumePdfTool);
  pi.registerTool(importResumeTool);
  pi.registerTool(proposeCandidateProfileTool);
  pi.registerTool(confirmCandidateProfileTool);
  pi.registerTool(getCandidateProfileTool);
  pi.registerTool(proposeCandidateProfileAmendmentTool);
  pi.registerTool(confirmCandidateProfileAmendmentTool);
  pi.registerTool(listCandidateProfileRevisionsTool);
  pi.registerTool(getCandidateProfileRevisionTool);
  pi.registerTool(createJobOpportunityTool);
  pi.registerTool(proposeJobAnalysisTool);
  pi.registerTool(confirmJobAnalysisTool);
  pi.registerTool(getJobOpportunityTool);
  pi.registerTool(calculateJobMatchTool);
  pi.registerTool(getJobMatchTool);
  pi.registerTool(fetchCompanySourceTool);
  pi.registerTool(proposeCompanyResearchTool);
  pi.registerTool(confirmCompanyResearchTool);
  pi.registerTool(getCompanyResearchTool);
  pi.registerTool(proposeCareerPreferencesTool);
  pi.registerTool(confirmCareerPreferencesTool);
  pi.registerTool(getCareerPreferencesTool);
  pi.registerTool(calculateEmployerFitTool);
  pi.registerTool(getEmployerFitTool);
  pi.registerTool(proposeTailoredResumeTool);
  pi.registerTool(confirmTailoredResumeTool);
  pi.registerTool(getTailoredResumeTool);
  pi.registerTool(exportTailoredResumeTool);
  pi.registerTool(createInterviewPlanTool);
  pi.registerTool(getInterviewPlanTool);
  pi.registerTool(recordOpportunityEventTool);
  pi.registerTool(getOpportunityTimelineTool);
  pi.registerTool(listOpportunityPipelineTool);
  pi.registerTool(getCareerDashboardTool);
  pi.registerTool(createCareerDataBackupTool);
  pi.registerTool(restoreCareerDataBackupTool);

  pi.registerCommand("career", {
    description: "Show the current read-only Career Steward dashboard",
    handler: async (_args, ctx) => {
      ctx.ui.notify(formatCareerDashboard(loadCareerDashboard(ctx.cwd)), "info");
    },
  });
}
