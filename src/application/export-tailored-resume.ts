import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import type { Static } from "typebox";
import { Type } from "typebox";

import { ResumeExportFormatSchema } from "../domain/resume-export.js";
import type {
  ResumeExportFormat,
  TailoredResumeExportArtifact,
} from "../domain/resume-export.js";
import type { TailoredResumeRevision } from "../domain/tailored-resume.js";
import { DocxResumeRenderer } from "../renderers/docx-resume-renderer.js";
import { MarkdownResumeRenderer } from "../renderers/markdown-resume-renderer.js";
import {
  RESUME_RENDERER_VERSION,
  type ResumeRenderer,
} from "../renderers/resume-renderer.js";
import { resolveWorkspaceOutputDirectory } from "../security/workspace-path.js";

export const ExportTailoredResumeInputSchema = Type.Object({
  opportunityId: Type.String({ minLength: 1 }),
  format: ResumeExportFormatSchema,
  outputDirectory: Type.Optional(
    Type.String({
      minLength: 1,
      description:
        "Workspace-relative output directory; defaults to career-steward-exports",
    }),
  ),
});

export type ExportTailoredResumeInput = Static<
  typeof ExportTailoredResumeInputSchema
>;

export class ResumeExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeExportError";
  }
}

const RENDERERS: Readonly<Record<ResumeExportFormat, ResumeRenderer>> = {
  markdown: new MarkdownResumeRenderer(),
  docx: new DocxResumeRenderer(),
};

function safeFilePart(value: string | undefined, fallback: string): string {
  const normalized = (value ?? fallback)
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

export function buildResumeExportFileName(
  resume: TailoredResumeRevision,
  extension: "md" | "docx",
): string {
  const name = safeFilePart(resume.contact.name, "candidate");
  const company = safeFilePart(resume.companyName, "company");
  const role = safeFilePart(resume.targetJobTitle, "role");
  const opportunity = safeFilePart(resume.opportunityId.slice(0, 12), "opportunity");
  return `${name}-${company}-${role}-${opportunity}-cv-r${resume.revision}.${extension}`;
}

export async function exportTailoredResume(
  resume: TailoredResumeRevision,
  workspace: string,
  input: ExportTailoredResumeInput,
  now = new Date(),
): Promise<TailoredResumeExportArtifact> {
  if (resume.opportunityId !== input.opportunityId) {
    throw new ResumeExportError(
      `Resume opportunity ${resume.opportunityId} does not match ${input.opportunityId}`,
    );
  }

  const renderer = RENDERERS[input.format];
  const rendered = await renderer.render(resume);
  if (rendered.bytes.length === 0) {
    throw new ResumeExportError(`${input.format} renderer produced an empty file`);
  }

  const { workspaceRoot, directory } = await resolveWorkspaceOutputDirectory(
    workspace,
    input.outputDirectory,
  );
  const fileName = buildResumeExportFileName(resume, rendered.extension);
  const outputPath = join(directory, fileName);
  try {
    await writeFile(outputPath, rendered.bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new ResumeExportError(
        `Export file already exists and will not be overwritten: ${relative(workspaceRoot, outputPath)}`,
      );
    }
    throw error;
  }

  return {
    opportunityId: resume.opportunityId,
    resumeRevision: resume.revision,
    profileRevision: resume.profileRevision,
    format: rendered.format,
    rendererVersion: RESUME_RENDERER_VERSION,
    fileName,
    relativePath: relative(workspaceRoot, outputPath),
    mediaType: rendered.mediaType,
    byteLength: rendered.bytes.length,
    sha256: createHash("sha256").update(rendered.bytes).digest("hex"),
    exportedAt: now.toISOString(),
  };
}
