import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCareerDashboard } from "../src/application/career-dashboard.js";
import {
  buildCareerPreferenceDraft,
} from "../src/application/career-preferences.js";
import { buildCompanyResearchDraft } from "../src/application/company-research.js";
import { buildEmployerFitReportDraft } from "../src/application/employer-fit.js";
import { exportTailoredResume } from "../src/application/export-tailored-resume.js";
import { buildInterviewPlanReportDraft } from "../src/application/interview-plan.js";
import {
  buildJobAnalysisDraft,
  createJobOpportunity,
} from "../src/application/job-analysis.js";
import { buildJobMatchReportDraft } from "../src/application/job-match-engine.js";
import {
  buildOpportunityEventDraft,
  deriveOpportunityStatus,
} from "../src/application/opportunity-tracking.js";
import {
  buildCandidateProfileDraft,
  createResumeEvidenceId,
} from "../src/application/profile-proposal.js";
import { buildTailoredResumeDraft } from "../src/application/tailored-resume.js";
import type { OpportunityEventType } from "../src/domain/opportunity-tracking.js";
import { CareerStore } from "../src/infrastructure/career-store.js";
import { PdfResumeParser } from "../src/parsers/pdf/pdf-resume-parser.js";

function buildTextPdf(lines: readonly string[]): Uint8Array {
  const content = [
    "BT",
    "/F1 10 Tf",
    "60 740 Td",
    ...lines.flatMap((line, index) => [
      ...(index === 0 ? [] : ["0 -18 Td"]),
      `(${line.replace(/[\\()]/g, "\\$&")}) Tj`,
    ]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

describe("Career Steward 1.0 acceptance journey", () => {
  it("completes an evidence-grounded journey from PDF to interview dashboard", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-acceptance-"));
    const store = new CareerStore(workspace);

    try {
      const resumeBytes = buildTextPdf([
        "Maya Chen",
        "maya.chen@example.test | +86 138 0000 0000",
        "Principal Software Architect",
        "Northstar Systems | Principal Software Architect | 2020 - Present",
        "Led architecture for reliable distributed analytics services used by multiple product teams.",
        "Reduced incident recovery time by defining service boundaries observability standards and failure policies.",
        "Designed TypeScript services and PostgreSQL data models for high volume analytical workflows.",
        "Facilitated architecture reviews across engineering security product and operations stakeholders.",
        "Mentored senior engineers in system design technical writing and incident response practices.",
        "Skills: TypeScript PostgreSQL distributed systems observability architecture leadership.",
        "Education: Bachelor of Software Engineering, Example Technical University.",
      ]);
      const document = await new PdfResumeParser().parse({
        fileName: "maya-chen-resume.pdf",
        mimeType: "application/pdf",
        bytes: resumeBytes,
      });
      const blockId = (needle: string): string => {
        const block = document.blocks.find((item) => item.text.includes(needle));
        if (!block) throw new Error(`Acceptance fixture block not found: ${needle}`);
        return block.id;
      };
      const identityBlock = blockId("Maya Chen");
      const contactBlock = blockId("maya.chen@example.test");
      const roleBlock = blockId("Northstar Systems");
      const architectureBlock = blockId("Led architecture");
      const reliabilityBlock = blockId("Reduced incident recovery");
      const typescriptBlock = blockId("TypeScript services");
      const skillsBlock = blockId("Skills:");
      const educationBlock = blockId("Education:");

      store.saveSourceDocument(document, new Date("2026-11-01T00:00:00.000Z"));
      const profileDraft = buildCandidateProfileDraft(
        document,
        {
          sourceDocumentId: document.source.sha256,
          name: { value: "Maya Chen", evidenceBlockIds: [identityBlock] },
          email: {
            value: "maya.chen@example.test",
            evidenceBlockIds: [contactBlock],
          },
          phone: { value: "+86 138 0000 0000", evidenceBlockIds: [contactBlock] },
          headline: {
            value: "Principal Software Architect",
            evidenceBlockIds: [blockId("Principal Software Architect")],
          },
          experiences: [
            {
              company: { value: "Northstar Systems", evidenceBlockIds: [roleBlock] },
              title: {
                value: "Principal Software Architect",
                evidenceBlockIds: [roleBlock],
              },
              startDate: { value: "2020", evidenceBlockIds: [roleBlock] },
              endDate: { value: "Present", evidenceBlockIds: [roleBlock] },
              summary: {
                value: "Led architecture for reliable distributed analytics services.",
                evidenceBlockIds: [architectureBlock],
              },
              achievements: [
                {
                  value: "Reduced incident recovery time through architecture and observability standards.",
                  evidenceBlockIds: [reliabilityBlock],
                },
              ],
            },
          ],
          skills: [
            { value: "TypeScript", evidenceBlockIds: [typescriptBlock, skillsBlock] },
            { value: "PostgreSQL", evidenceBlockIds: [typescriptBlock, skillsBlock] },
            { value: "Distributed systems", evidenceBlockIds: [architectureBlock, skillsBlock] },
          ],
          education: [
            {
              value: "Bachelor of Software Engineering, Example Technical University",
              evidenceBlockIds: [educationBlock],
            },
          ],
        },
        new Date("2026-11-01T00:05:00.000Z"),
      );
      store.saveProfileDraft(profileDraft);
      const profile = store.confirmProfileDraft(
        profileDraft.id,
        new Date("2026-11-01T00:10:00.000Z"),
      );

      const opportunity = createJobOpportunity(
        {
          companyName: "Future Analytics Inc.",
          jobTitle: "Staff Software Architect",
          jdText: [
            "Lead architecture for a reliable distributed analytics platform.",
            "Strong TypeScript experience is required for backend services.",
            "Production Kubernetes experience is required for platform operations.",
          ].join("\n"),
          sourceUrl: "https://jobs.example.test/staff-architect",
        },
        new Date("2026-11-01T01:00:00.000Z"),
      );
      store.saveJobOpportunity(opportunity);
      const analysisDraft = buildJobAnalysisDraft(
        opportunity,
        {
          opportunityId: opportunity.id,
          roleSummary: "Architecture leadership for a distributed analytics platform.",
          requirements: [
            {
              text: "Lead distributed analytics architecture",
              category: "responsibility",
              priority: "must",
              explicitness: "explicit",
              evidenceBlockIds: ["jd-b1"],
            },
            {
              text: "Strong TypeScript experience",
              category: "required-skill",
              priority: "should",
              explicitness: "explicit",
              evidenceBlockIds: ["jd-b2"],
            },
            {
              text: "Production Kubernetes experience",
              category: "required-skill",
              priority: "must",
              explicitness: "explicit",
              evidenceBlockIds: ["jd-b3"],
            },
          ],
        },
        new Date("2026-11-01T01:05:00.000Z"),
      );
      store.saveJobAnalysisDraft(analysisDraft);
      const analysis = store.confirmJobAnalysisDraft(
        analysisDraft.id,
        new Date("2026-11-01T01:10:00.000Z"),
      );

      const architectureEvidence = createResumeEvidenceId(
        document.source.sha256,
        architectureBlock,
      );
      const typescriptEvidence = createResumeEvidenceId(
        document.source.sha256,
        typescriptBlock,
      );
      const match = store.saveJobMatchReport(
        buildJobMatchReportDraft(
          profile,
          analysis,
          {
            opportunityId: opportunity.id,
            mappings: [
              {
                requirementId: analysis.requirements[0]!.id,
                assessment: "strong",
                candidateEvidenceIds: [architectureEvidence],
                explanation: "Direct distributed analytics architecture evidence.",
                confidence: 0.92,
              },
              {
                requirementId: analysis.requirements[1]!.id,
                assessment: "strong",
                candidateEvidenceIds: [typescriptEvidence],
                explanation: "Direct TypeScript backend design evidence.",
                confidence: 0.9,
              },
              {
                requirementId: analysis.requirements[2]!.id,
                assessment: "gap",
                candidateEvidenceIds: [],
                explanation: "The confirmed profile contains no production Kubernetes evidence.",
                confidence: 0.88,
              },
            ],
          },
          { provider: "acceptance", modelId: "semantic-fixture" },
          new Date("2026-11-01T01:20:00.000Z"),
        ),
      );

      const researchDraft = buildCompanyResearchDraft(
        opportunity,
        {
          opportunityId: opportunity.id,
          sources: [
            {
              sourceKey: "official-stability",
              sourceType: "official",
              title: "Company update",
              url: "https://future-analytics.example/company-update",
              publisher: "Future Analytics Inc.",
              retrievedAt: "2026-11-01T02:00:00.000Z",
              excerpt: "The company reports multi-year enterprise contracts.",
              contentSha256: "a".repeat(64),
              retrievalMethod: "career-steward-fetch",
            },
            {
              sourceKey: "community-workload",
              sourceType: "community",
              title: "Engineering workload discussion",
              url: "https://community.example/workload",
              publisher: "Example Community",
              retrievedAt: "2026-11-01T02:05:00.000Z",
              excerpt: "Reports describe release pressure as dependent on the team.",
              contentSha256: "b".repeat(64),
              retrievalMethod: "career-steward-fetch",
            },
          ],
          claims: [
            {
              category: "stability",
              basis: "official-fact",
              text: "The company reports multi-year enterprise contracts.",
              sourceKeys: ["official-stability"],
              confidence: 0.8,
            },
            {
              category: "work-intensity",
              basis: "community-sentiment",
              text: "Community reports describe team-dependent release pressure.",
              sourceKeys: ["community-workload"],
              sentiment: "mixed",
              confidence: 0.55,
            },
          ],
          warnings: ["Community evidence is a limited sentiment sample."],
        },
        new Date("2026-11-01T02:10:00.000Z"),
      );
      store.saveCompanyResearchDraft(researchDraft);
      const research = store.confirmCompanyResearchDraft(
        researchDraft.id,
        new Date("2026-11-01T02:15:00.000Z"),
      );

      const preferenceDraft = buildCareerPreferenceDraft(
        {
          employerPreferences: [
            {
              dimension: "work-intensity",
              importance: 5,
              desiredOutcome: "Predictable hours with exceptional overtime only.",
              dealBreaker: true,
            },
            {
              dimension: "stability",
              importance: 4,
              desiredOutcome: "Durable enterprise demand.",
              dealBreaker: false,
            },
          ],
        },
        new Date("2026-11-01T02:20:00.000Z"),
      );
      store.saveCareerPreferenceDraft(preferenceDraft);
      const preferences = store.confirmCareerPreferenceDraft(
        preferenceDraft.id,
        new Date("2026-11-01T02:25:00.000Z"),
      );
      const employerFit = store.saveEmployerFitReport(
        buildEmployerFitReportDraft(
          preferences,
          research,
          {
            opportunityId: opportunity.id,
            mappings: [
              {
                preferenceId: preferences.employerPreferences[0]!.id,
                assessment: "unknown",
                companyClaimIds: [],
                explanation: "The limited community sample is insufficient for a firm conclusion.",
                confidence: 0.4,
              },
              {
                preferenceId: preferences.employerPreferences[1]!.id,
                assessment: "aligned",
                companyClaimIds: [research.claims[0]!.id],
                explanation: "Reported contract duration supports the stability preference.",
                confidence: 0.75,
              },
            ],
          },
          { provider: "acceptance", modelId: "semantic-fixture" },
          new Date("2026-11-01T02:30:00.000Z"),
        ),
      );

      const resumeDraft = buildTailoredResumeDraft(
        profile,
        opportunity,
        analysis,
        match,
        {
          opportunityId: opportunity.id,
          headline: {
            text: "Software architect for reliable distributed analytics systems.",
            candidateEvidenceIds: [architectureEvidence],
            requirementIds: [analysis.requirements[0]!.id],
          },
          professionalSummary: {
            text: "Architect with evidence-backed distributed systems and TypeScript experience.",
            candidateEvidenceIds: [architectureEvidence, typescriptEvidence],
            requirementIds: [
              analysis.requirements[0]!.id,
              analysis.requirements[1]!.id,
            ],
          },
          experiences: [
            {
              experienceId: profile.experiences[0]!.id,
              bullets: [
                {
                  text: "Led architecture for reliable distributed analytics services.",
                  candidateEvidenceIds: [architectureEvidence],
                  requirementIds: [analysis.requirements[0]!.id],
                },
              ],
            },
          ],
          skills: [
            {
              profileSkillIndex: 0,
              requirementIds: [analysis.requirements[1]!.id],
            },
          ],
          educationIndexes: [0],
        },
        new Date("2026-11-01T03:00:00.000Z"),
      );
      store.saveTailoredResumeDraft(resumeDraft);
      const resume = store.confirmTailoredResumeDraft(
        resumeDraft.id,
        new Date("2026-11-01T03:05:00.000Z"),
      );
      const exportArtifact = await exportTailoredResume(
        resume,
        workspace,
        { opportunityId: opportunity.id, format: "docx" },
        new Date("2026-11-01T03:10:00.000Z"),
      );
      const docx = await readFile(join(workspace, exportArtifact.relativePath));

      const interviewPlan = store.saveInterviewPlanReport(
        buildInterviewPlanReportDraft(
          profile,
          opportunity,
          analysis,
          match,
          research,
          {
            opportunityId: opportunity.id,
            preparationItems: [
              {
                requirementId: analysis.requirements[0]!.id,
                candidateEvidenceIds: [architectureEvidence],
                objective: "Explain architecture decisions and reliability trade-offs.",
                talkingPoints: ["Context, constraints, decision, and consequences."],
                practiceQuestions: ["How did you design the distributed platform?"],
                preparationActions: ["Rehearse a five-minute architecture walkthrough."],
              },
              {
                requirementId: analysis.requirements[1]!.id,
                candidateEvidenceIds: [typescriptEvidence],
                objective: "Demonstrate practical TypeScript depth.",
                talkingPoints: ["Type safety, service boundaries, and failure handling."],
                practiceQuestions: ["Which TypeScript trade-offs have you made?"],
                preparationActions: ["Review one representative backend design."],
              },
              {
                requirementId: analysis.requirements[2]!.id,
                candidateEvidenceIds: [],
                objective: "Prepare an honest Kubernetes gap response and learning plan.",
                talkingPoints: [],
                practiceQuestions: ["What production Kubernetes experience do you have?"],
                preparationActions: ["Study deployment primitives and prepare a 30-day plan."],
                honestBoundary: "I do not have confirmed production Kubernetes experience.",
              },
            ],
            starStories: [
              {
                title: "Reliable analytics architecture",
                experienceId: profile.experiences[0]!.id,
                requirementIds: [analysis.requirements[0]!.id],
                candidateEvidenceIds: [architectureEvidence],
                situation: "Multiple product teams needed a reliable analytics platform.",
                task: "Define an architecture that made service ownership explicit.",
                action: "Led the distributed analytics architecture design.",
                result: "Established the reliable design recorded in the confirmed resume evidence.",
              },
            ],
            schedule: [
              {
                day: 1,
                title: "Architecture and TypeScript",
                durationMinutes: 90,
                requirementIds: [
                  analysis.requirements[0]!.id,
                  analysis.requirements[1]!.id,
                ],
                activities: ["Architecture mock", "TypeScript deep dive"],
              },
              {
                day: 2,
                title: "Kubernetes gap preparation",
                durationMinutes: 60,
                requirementIds: [analysis.requirements[2]!.id],
                activities: ["Gap response rehearsal", "Learning-plan review"],
              },
            ],
            reverseInterviewQuestions: [
              {
                question: "How does the team manage release pressure and after-hours work?",
                rationale: "Clarify a mixed community workload signal neutrally.",
                companyClaimIds: [research.claims[1]!.id],
              },
            ],
          },
          { provider: "acceptance", modelId: "semantic-fixture" },
          new Date("2026-11-01T03:20:00.000Z"),
        ),
      );

      const appendEvent = (eventType: OpportunityEventType, now: string): void => {
        const events = store.getOpportunityEvents(opportunity.id);
        store.appendOpportunityEvent(
          buildOpportunityEventDraft(
            opportunity,
            events,
            {
              opportunityId: opportunity.id,
              eventType,
              ...(eventType === "interview-scheduled"
                ? {
                    interview: {
                      scheduledFor: "2026-11-08T02:00:00.000Z",
                      round: "System design",
                      format: "Video",
                    },
                  }
                : {}),
            },
            new Date(now),
          ),
        );
      };
      appendEvent("saved", "2026-11-01T04:00:00.000Z");
      appendEvent("preparation-started", "2026-11-01T04:05:00.000Z");
      appendEvent("application-submitted", "2026-11-01T04:10:00.000Z");
      appendEvent("interview-scheduled", "2026-11-01T04:15:00.000Z");

      const currentProfile = store.getCurrentProfile();
      const currentPreferences = store.getCurrentCareerPreferences();
      const dashboard = buildCareerDashboard(
        {
          ...(currentProfile ? { profile: currentProfile } : {}),
          ...(currentPreferences ? { preferences: currentPreferences } : {}),
          pendingConfirmations: store.listPendingConfirmations(),
          opportunities: store.listJobOpportunities().map((storedOpportunity) => {
            const jobAnalysis = store.getCurrentJobAnalysis(storedOpportunity.id);
            const jobMatch = store.getCurrentJobMatch(storedOpportunity.id);
            const companyResearch = store.getCurrentCompanyResearch(
              storedOpportunity.id,
            );
            const employerFit = store.getCurrentEmployerFit(storedOpportunity.id);
            const tailoredResume = store.getCurrentTailoredResume(
              storedOpportunity.id,
            );
            const interviewPlan = store.getCurrentInterviewPlan(
              storedOpportunity.id,
            );

            return {
              opportunity: storedOpportunity,
              events: store.getOpportunityEvents(storedOpportunity.id),
              ...(jobAnalysis ? { jobAnalysis } : {}),
              ...(jobMatch ? { jobMatch } : {}),
              ...(companyResearch ? { companyResearch } : {}),
              ...(employerFit ? { employerFit } : {}),
              ...(tailoredResume ? { tailoredResume } : {}),
              ...(interviewPlan ? { interviewPlan } : {}),
            };
          }),
        },
        new Date("2026-11-01T04:20:00.000Z"),
      );

      expect(document.quality.status).toBe("good");
      expect(profile.revision).toBe(1);
      expect(match.criticalGapRequirementIds).toEqual([analysis.requirements[2]!.id]);
      expect(match.metrics.matchScore).toBeLessThan(70);
      expect(employerFit.metrics.appliedCaps).toContain("deal-breaker-unknown-cap-69");
      expect(resume.markdown).not.toContain("Kubernetes");
      expect(resume.requirementCoverage.uncoveredRequirementIds).toEqual([
        analysis.requirements[2]!.id,
      ]);
      expect(docx.subarray(0, 2).toString()).toBe("PK");
      expect(exportArtifact.resumeRevision).toBe(resume.revision);
      expect(interviewPlan.preparationItems[2]).toMatchObject({
        assessment: "gap",
        focusType: "mitigate-gap",
        candidateEvidence: [],
      });
      expect(interviewPlan.metrics).toMatchObject({
        requirementCount: 3,
        riskItemCount: 1,
        scheduledDays: 2,
      });
      expect(
        deriveOpportunityStatus(store.getOpportunityEvents(opportunity.id)),
      ).toBe("interviewing");
      expect(dashboard.pipeline.interviewing).toBe(1);
      expect(dashboard.pendingConfirmations).toEqual([]);
      expect(dashboard.nextActions).toEqual([]);
      expect(dashboard.recentActivity[0]?.eventType).toBe("interview-scheduled");
    } finally {
      store.close();
    }
  });
});
