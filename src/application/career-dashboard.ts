import type { CandidateProfileRevision } from "../domain/candidate-profile.js";
import type {
  CareerDashboard,
  CareerDashboardAction,
  PendingConfirmation,
  OpportunityPipelineCounts,
} from "../domain/career-dashboard.js";
import type { CareerPreferenceRevision } from "../domain/career-preferences.js";
import type { CompanyResearchRevision } from "../domain/company-intelligence.js";
import type { EmployerFitReport } from "../domain/employer-fit.js";
import type { InterviewPlanReport } from "../domain/interview-plan.js";
import type { JobMatchReport } from "../domain/job-match.js";
import type {
  JobAnalysisRevision,
  JobOpportunity,
} from "../domain/job-opportunity.js";
import type {
  OpportunityEvent,
  OpportunityPipelineStatus,
} from "../domain/opportunity-tracking.js";
import type { TailoredResumeRevision } from "../domain/tailored-resume.js";
import { deriveOpportunityStatus } from "./opportunity-tracking.js";

export interface CareerDashboardOpportunitySnapshot {
  opportunity: JobOpportunity;
  events: readonly OpportunityEvent[];
  jobAnalysis?: JobAnalysisRevision;
  jobMatch?: JobMatchReport;
  companyResearch?: CompanyResearchRevision;
  employerFit?: EmployerFitReport;
  tailoredResume?: TailoredResumeRevision;
  interviewPlan?: InterviewPlanReport;
}

export interface CareerDashboardSnapshot {
  profile?: CandidateProfileRevision;
  preferences?: CareerPreferenceRevision;
  opportunities: readonly CareerDashboardOpportunitySnapshot[];
  pendingConfirmations: readonly PendingConfirmation[];
}

const ACTIVE_STATUSES = new Set<OpportunityPipelineStatus>([
  "discovered",
  "saved",
  "preparing",
  "applied",
  "interviewing",
  "offer",
]);

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

const CONFIRMATION_TOOL: Readonly<Record<PendingConfirmation["type"], string>> = {
  "candidate-profile-import": "confirm_candidate_profile",
  "candidate-profile-amendment": "confirm_candidate_profile_amendment",
  "job-analysis": "confirm_job_analysis",
  "company-research": "confirm_company_research",
  "career-preferences": "confirm_career_preferences",
  "tailored-resume": "confirm_tailored_resume",
};

const CONFIRMATION_LABEL: Readonly<Record<PendingConfirmation["type"], string>> = {
  "candidate-profile-import": "候选人档案导入",
  "candidate-profile-amendment": "候选人档案修订",
  "job-analysis": "JD 分析",
  "company-research": "公司调研",
  "career-preferences": "职业偏好",
  "tailored-resume": "定制简历",
};

const PENDING_TYPE_FOR_ACTION: Partial<
  Readonly<Record<CareerDashboardAction["type"], PendingConfirmation["type"]>>
> = {
  "analyze-opportunity": "job-analysis",
  "research-company": "company-research",
  "tailor-resume": "tailored-resume",
  "define-preferences": "career-preferences",
};

function emptyPipelineCounts(): OpportunityPipelineCounts {
  return {
    discovered: 0,
    saved: 0,
    preparing: 0,
    applied: 0,
    interviewing: 0,
    offer: 0,
    accepted: 0,
    rejected: 0,
    withdrawn: 0,
    closed: 0,
  };
}

function hasCurrentMatch(
  snapshot: CareerDashboardOpportunitySnapshot,
  profile: CandidateProfileRevision | undefined,
): boolean {
  return Boolean(
    snapshot.jobAnalysis &&
      snapshot.jobMatch &&
      profile &&
      snapshot.jobMatch.profileRevision === profile.revision &&
      snapshot.jobMatch.jobAnalysisRevision === snapshot.jobAnalysis.revision,
  );
}

function hasCurrentTailoredResume(
  snapshot: CareerDashboardOpportunitySnapshot,
  profile: CandidateProfileRevision | undefined,
): boolean {
  return Boolean(
    hasCurrentMatch(snapshot, profile) &&
      snapshot.tailoredResume &&
      snapshot.tailoredResume!.profileRevision === profile!.revision &&
      snapshot.tailoredResume!.jobAnalysisRevision === snapshot.jobAnalysis!.revision &&
      snapshot.tailoredResume!.matchReportRevision === snapshot.jobMatch!.revision,
  );
}

function hasCurrentInterviewPlan(
  snapshot: CareerDashboardOpportunitySnapshot,
  profile: CandidateProfileRevision | undefined,
): boolean {
  return Boolean(
    hasCurrentMatch(snapshot, profile) &&
      snapshot.interviewPlan &&
      snapshot.interviewPlan!.profileRevision === profile!.revision &&
      snapshot.interviewPlan!.jobAnalysisRevision === snapshot.jobAnalysis!.revision &&
      snapshot.interviewPlan!.matchReportRevision === snapshot.jobMatch!.revision &&
      snapshot.interviewPlan!.companyResearchRevision ===
        snapshot.companyResearch?.revision,
  );
}

function hasCurrentEmployerFit(
  snapshot: CareerDashboardOpportunitySnapshot,
  preferences: CareerPreferenceRevision | undefined,
): boolean {
  return Boolean(
    snapshot.companyResearch &&
      snapshot.employerFit &&
      preferences &&
      snapshot.employerFit.preferenceRevision === preferences.revision &&
      snapshot.employerFit.companyResearchRevision === snapshot.companyResearch.revision,
  );
}

function opportunityAction(
  snapshot: CareerDashboardOpportunitySnapshot,
  status: OpportunityPipelineStatus,
  profile: CandidateProfileRevision | undefined,
  preferences: CareerPreferenceRevision | undefined,
): CareerDashboardAction | undefined {
  const { opportunity } = snapshot;
  const target = `${opportunity.companyName} · ${opportunity.jobTitle}`;
  const urgent = status === "interviewing" || status === "offer" ? "high" : "medium";

  if (!snapshot.jobAnalysis) {
    return {
      type: "analyze-opportunity",
      priority: urgent,
      title: `分析 ${target} 的 JD`,
      reason: "尚无已确认的岗位分析，后续匹配和定制简历没有稳定输入。",
      toolName: "propose_job_analysis",
      opportunityId: opportunity.id,
    };
  }
  if (profile && !hasCurrentMatch(snapshot, profile)) {
    return {
      type: "calculate-match",
      priority: urgent,
      title: `重新计算 ${target} 的匹配度`,
      reason: "匹配报告缺失，或没有基于当前档案与最新 JD 分析生成。",
      toolName: "calculate_job_match",
      opportunityId: opportunity.id,
    };
  }
  if (
    profile &&
    ["discovered", "saved", "preparing"].includes(status) &&
    !hasCurrentTailoredResume(snapshot, profile)
  ) {
    return {
      type: "tailor-resume",
      priority: "medium",
      title: `为 ${target} 准备定制简历`,
      reason: "当前机会尚无基于最新档案、JD 分析和匹配报告的已确认简历。",
      toolName: "propose_tailored_resume",
      opportunityId: opportunity.id,
    };
  }
  if (status === "interviewing" && profile && !hasCurrentInterviewPlan(snapshot, profile)) {
    return {
      type: "prepare-interview",
      priority: "high",
      title: `制定 ${target} 的面试计划`,
      reason: "机会已进入面试阶段，但当前版本的面试准备计划缺失或已过期。",
      toolName: "create_interview_plan",
      opportunityId: opportunity.id,
    };
  }
  if (["applied", "interviewing", "offer"].includes(status) && !snapshot.companyResearch) {
    return {
      type: "research-company",
      priority: status === "offer" ? "high" : status === "interviewing" ? "medium" : "low",
      title: `调研 ${opportunity.companyName}`,
      reason: "尚无已确认的公司口碑、雇主质量与工作方式证据。",
      toolName: "propose_company_research",
      opportunityId: opportunity.id,
    };
  }
  if (status === "offer" && !preferences) {
    return {
      type: "define-preferences",
      priority: "high",
      title: "确认职业偏好与底线",
      reason: "已有 Offer，但尚无已确认的职业偏好，无法进行可解释的雇主适配评估。",
      toolName: "propose_career_preferences",
      opportunityId: opportunity.id,
    };
  }
  if (status === "offer" && !hasCurrentEmployerFit(snapshot, preferences)) {
    return {
      type: "calculate-employer-fit",
      priority: "high",
      title: `评估 ${target} 的雇主适配度`,
      reason: "Employer Fit 缺失，或没有基于最新职业偏好与公司调研生成。",
      toolName: "calculate_employer_fit",
      opportunityId: opportunity.id,
    };
  }
  if (status === "offer") {
    return {
      type: "review-offer",
      priority: "high",
      title: `复核 ${target} 的 Offer 决策`,
      reason: "岗位匹配、公司证据与雇主适配信息已具备，可以进入人工决策。",
      toolName: "get_employer_fit",
      opportunityId: opportunity.id,
    };
  }
  return undefined;
}

export function buildCareerDashboard(
  snapshot: CareerDashboardSnapshot,
  now = new Date(),
): CareerDashboard {
  const pipeline = emptyPipelineCounts();
  const statuses = new Map<string, OpportunityPipelineStatus>();
  const opportunityById = new Map(
    snapshot.opportunities.map((item) => [item.opportunity.id, item.opportunity]),
  );

  for (const item of snapshot.opportunities) {
    const status = deriveOpportunityStatus(item.events);
    statuses.set(item.opportunity.id, status);
    pipeline[status] += 1;
  }

  const pendingConfirmations = snapshot.pendingConfirmations
    .map((pending) => {
      const opportunity = pending.opportunityId
        ? opportunityById.get(pending.opportunityId)
        : undefined;
      return {
        ...pending,
        ...(opportunity
          ? {
              companyName: opportunity.companyName,
              jobTitle: opportunity.jobTitle,
            }
          : {}),
      };
    })
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        left.draftId.localeCompare(right.draftId),
    );

  const recentActivity = snapshot.opportunities
    .flatMap(({ opportunity, events }) =>
      events.map((event) => ({
        opportunityId: opportunity.id,
        companyName: opportunity.companyName,
        jobTitle: opportunity.jobTitle,
        eventType: event.eventType,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        happenedAt: event.happenedAt,
        recordedAt: event.recordedAt,
        ...(event.note ? { note: event.note } : {}),
      })),
    )
    .sort(
      (left, right) =>
        right.recordedAt.localeCompare(left.recordedAt) ||
        right.happenedAt.localeCompare(left.happenedAt),
    )
    .slice(0, 5);

  const nextActions: CareerDashboardAction[] = pendingConfirmations.map((pending) => ({
    type: "review-confirmation",
    priority: "high",
    title: `审核${CONFIRMATION_LABEL[pending.type]}`,
    reason: pending.companyName
      ? `${pending.companyName} · ${pending.jobTitle ?? ""} 有一项草稿等待人工确认。`
      : "有一项草稿等待人工确认；确认前不会成为系统事实。",
    toolName: CONFIRMATION_TOOL[pending.type],
    ...(pending.opportunityId ? { opportunityId: pending.opportunityId } : {}),
    draftId: pending.draftId,
  }));

  const hasPendingProfile = pendingConfirmations.some(
    (item) =>
      item.type === "candidate-profile-import" ||
      item.type === "candidate-profile-amendment",
  );
  if (!snapshot.profile && !hasPendingProfile) {
    nextActions.push({
      type: "import-resume",
      priority: "high",
      title: "导入并确认候选人档案",
      reason: "尚无已确认的 Candidate Profile，匹配、定制简历和面试计划无法可靠生成。",
      toolName: "import_resume",
    });
  }

  for (const item of snapshot.opportunities) {
    const status = statuses.get(item.opportunity.id)!;
    if (!ACTIVE_STATUSES.has(status)) continue;
    const action = opportunityAction(item, status, snapshot.profile, snapshot.preferences);
    if (!action) continue;
    const pendingType = PENDING_TYPE_FOR_ACTION[action.type];
    const alreadyPending = pendingType
      ? pendingConfirmations.some(
          (pending) =>
            pending.type === pendingType &&
            (pendingType === "career-preferences" ||
              pending.opportunityId === item.opportunity.id),
        )
      : false;
    if (!alreadyPending) nextActions.push(action);
  }

  const deduplicatedActions = nextActions.filter(
    (action, index, actions) =>
      action.type !== "define-preferences" ||
      actions.findIndex((candidate) => candidate.type === action.type) === index,
  );

  return {
    generatedAt: now.toISOString(),
    profile: snapshot.profile
      ? {
          exists: true,
          revision: snapshot.profile.revision,
          confirmedAt: snapshot.profile.confirmedAt,
          experienceCount: snapshot.profile.experiences.length,
          skillCount: snapshot.profile.skills.length,
          educationCount: snapshot.profile.education.length,
        }
      : {
          exists: false,
          experienceCount: 0,
          skillCount: 0,
          educationCount: 0,
        },
    opportunityCount: snapshot.opportunities.length,
    pipeline,
    pendingConfirmations,
    recentActivity,
    nextActions: deduplicatedActions
      .map((action, order) => ({ action, order }))
      .sort(
        (left, right) =>
          PRIORITY_ORDER[left.action.priority] - PRIORITY_ORDER[right.action.priority] ||
          left.order - right.order,
      )
      .slice(0, 8)
      .map(({ action }) => action),
  };
}

export function formatCareerDashboard(dashboard: CareerDashboard): string {
  const profile = dashboard.profile.exists
    ? `Candidate Profile v${dashboard.profile.revision}（确认于 ${dashboard.profile.confirmedAt}；经历 ${dashboard.profile.experienceCount} / 技能 ${dashboard.profile.skillCount} / 教育 ${dashboard.profile.educationCount}）`
    : "Candidate Profile 尚未确认";
  const activePipeline = [
    `discovered ${dashboard.pipeline.discovered}`,
    `saved ${dashboard.pipeline.saved}`,
    `preparing ${dashboard.pipeline.preparing}`,
    `applied ${dashboard.pipeline.applied}`,
    `interviewing ${dashboard.pipeline.interviewing}`,
    `offer ${dashboard.pipeline.offer}`,
  ].join(" · ");
  const terminalPipeline = [
    `accepted ${dashboard.pipeline.accepted}`,
    `rejected ${dashboard.pipeline.rejected}`,
    `withdrawn ${dashboard.pipeline.withdrawn}`,
    `closed ${dashboard.pipeline.closed}`,
  ].join(" · ");
  const pending = dashboard.pendingConfirmations.length
    ? dashboard.pendingConfirmations
        .map(
          (item) =>
            `- ${CONFIRMATION_LABEL[item.type]}：${item.draftId}${
              item.companyName ? `（${item.companyName} · ${item.jobTitle}）` : ""
            }`,
        )
        .join("\n")
    : "- 无";
  const actions = dashboard.nextActions.length
    ? dashboard.nextActions
        .map((action, index) => `${index + 1}. [${action.priority}] ${action.title}`)
        .join("\n")
    : "- 暂无建议动作";
  const activity = dashboard.recentActivity.length
    ? dashboard.recentActivity
        .map(
          (item) =>
            `- ${item.companyName} · ${item.jobTitle}：${item.eventType}（${item.fromStatus} → ${item.toStatus}）`,
        )
        .join("\n")
    : "- 无";

  return [
    "Career Steward 动态工作台",
    "",
    profile,
    `机会共 ${dashboard.opportunityCount} 个`,
    `进行中：${activePipeline}`,
    `已结束：${terminalPipeline}`,
    "",
    `待确认（${dashboard.pendingConfirmations.length}）`,
    pending,
    "",
    "最近动态（最多 5 条）",
    activity,
    "",
    "下一步建议",
    actions,
    "",
    "提示：工作台只读；建议不会自动修改状态或确认草稿。",
  ].join("\n");
}
