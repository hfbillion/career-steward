import { mkdtemp, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildResumeExportFileName,
  exportTailoredResume,
  ResumeExportError,
} from "../src/application/export-tailored-resume.js";
import type { TailoredResumeRevision } from "../src/domain/tailored-resume.js";

function createResume(): TailoredResumeRevision {
  const evidence = {
    id: "resume:source:block",
    sourceType: "resume" as const,
    sourceId: "source",
    blockId: "block",
    originalText: "Led architecture for reliable distributed systems.",
    confidence: 0.95,
  };
  const statement = (text: string) => ({
    text,
    candidateEvidence: [evidence],
    requirementIds: ["requirement-1"],
  });
  const firstExperienceBullets = [
    "Led architecture for reliable distributed analytical systems across multiple product teams and production environments.",
    "Defined service boundaries, failure-handling policies, and observability standards for critical data-processing workloads.",
    "Facilitated architecture reviews with engineering, security, product, and operations stakeholders.",
    "Guided incremental modernization while preserving delivery continuity and measurable operational reliability.",
    "Mentored senior engineers on design trade-offs, technical writing, and evidence-based architectural decisions.",
  ];
  const secondExperienceBullets = [
    "Designed TypeScript services and PostgreSQL data models for a high-volume analytical workflow.",
    "Improved incident diagnosis through structured logging, service-level indicators, and actionable operational runbooks.",
    "Partnered with product teams to translate ambiguous requirements into testable technical milestones.",
    "Reviewed performance bottlenecks and introduced capacity planning practices for predictable platform growth.",
    "Documented architecture decisions and migration constraints so teams could deliver changes independently.",
  ];
  const markdown = [
    "# Ada Lovelace",
    "",
    "ada@example.test · +86 138 0000 0000",
    "",
    "Target Role: Staff Software Architect",
    "",
    "Evidence-grounded architecture leader",
    "",
    "## Professional Summary",
    "",
    "Designs reliable distributed analytical systems.",
    "",
    "## Experience",
    "",
    "### Software Architect — Analytical Engines Ltd.",
    "",
    "2021 – Present",
    ...firstExperienceBullets.map((bullet) => `- ${bullet}`),
    "",
    "### Senior Software Engineer — Computing Systems Co.",
    "",
    "2017 – 2021",
    ...secondExperienceBullets.map((bullet) => `- ${bullet}`),
    "",
    "## Skills",
    "",
    "TypeScript, PostgreSQL",
    "",
    "## Education",
    "",
    "- BSc Computer Science",
    "",
  ].join("\n");

  return {
    id: "tailored-resume-1",
    opportunityId: "opportunity-1234567890",
    companyName: "Future/Analytics Inc.",
    targetJobTitle: "Staff Software Architect",
    profileRevision: 3,
    jobAnalysisRevision: 2,
    matchReportRevision: 4,
    createdAt: "2026-11-01T04:00:00.000Z",
    confirmedAt: "2026-11-01T05:00:00.000Z",
    revision: 2,
    contact: {
      name: "Ada Lovelace",
      email: "ada@example.test",
      phone: "+86 138 0000 0000",
    },
    headline: statement("Evidence-grounded architecture leader"),
    professionalSummary: statement(
      "Designs reliable distributed analytical systems.",
    ),
    experiences: [
      {
        experienceId: "experience-1",
        company: "Analytical Engines Ltd.",
        title: "Software Architect",
        startDate: "2021",
        endDate: "Present",
        bullets: firstExperienceBullets.map(statement),
      },
      {
        experienceId: "experience-2",
        company: "Computing Systems Co.",
        title: "Senior Software Engineer",
        startDate: "2017",
        endDate: "2021",
        bullets: secondExperienceBullets.map(statement),
      },
    ],
    skills: [
      { profileSkillIndex: 0, value: "TypeScript", requirementIds: ["requirement-1"] },
      { profileSkillIndex: 1, value: "PostgreSQL", requirementIds: ["requirement-1"] },
    ],
    education: ["BSc Computer Science"],
    requirementCoverage: {
      coveredRequirementIds: ["requirement-1"],
      uncoveredRequirementIds: [],
      coverageScore: 100,
    },
    atsChecks: [
      { id: "single-column", passed: true, detail: "Single reading order." },
    ],
    warnings: [],
    markdown,
  };
}

describe("tailored resume export", () => {
  it("exports canonical Markdown byte-for-byte with provenance", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-export-md-"));
    const resume = createResume();
    const artifact = await exportTailoredResume(
      resume,
      workspace,
      { opportunityId: resume.opportunityId, format: "markdown" },
      new Date("2026-11-01T06:00:00.000Z"),
    );

    expect(artifact).toMatchObject({
      opportunityId: resume.opportunityId,
      resumeRevision: 2,
      profileRevision: 3,
      format: "markdown",
      rendererVersion: "resume-renderer/1.0",
      mediaType: "text/markdown; charset=utf-8",
      exportedAt: "2026-11-01T06:00:00.000Z",
    });
    expect(await readFile(join(workspace, artifact.relativePath), "utf8")).toBe(
      resume.markdown,
    );
    expect(artifact.byteLength).toBe(Buffer.byteLength(resume.markdown));
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("exports a non-empty DOCX with a sanitized revision-pinned name", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-export-docx-"));
    const resume = createResume();
    const artifact = await exportTailoredResume(resume, workspace, {
      opportunityId: resume.opportunityId,
      format: "docx",
      outputDirectory: "exports/cv",
    });
    const bytes = await readFile(join(workspace, artifact.relativePath));

    expect(artifact.format).toBe("docx");
    expect(artifact.fileName).toBe(buildResumeExportFileName(resume, "docx"));
    expect(artifact.fileName).not.toContain("/");
    expect(artifact.fileName).toContain("cv-r2.docx");
    expect(artifact.mediaType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(bytes.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(bytes.length).toBeGreaterThan(1_000);
  });

  it("does not overwrite an existing export", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-export-existing-"));
    const resume = createResume();
    const input = { opportunityId: resume.opportunityId, format: "markdown" as const };
    await exportTailoredResume(resume, workspace, input);

    await expect(exportTailoredResume(resume, workspace, input)).rejects.toThrow(
      ResumeExportError,
    );
  });

  it("rejects traversal and symlink output directories", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-export-safe-"));
    const outside = await mkdtemp(join(tmpdir(), "career-steward-export-outside-"));
    const resume = createResume();

    await expect(
      exportTailoredResume(resume, workspace, {
        opportunityId: resume.opportunityId,
        format: "markdown",
        outputDirectory: "../outside",
      }),
    ).rejects.toThrow("must stay inside");

    await symlink(outside, join(workspace, "linked-output"));
    await expect(
      exportTailoredResume(resume, workspace, {
        opportunityId: resume.opportunityId,
        format: "markdown",
        outputDirectory: "linked-output",
      }),
    ).rejects.toThrow("must stay inside");
  });
});
