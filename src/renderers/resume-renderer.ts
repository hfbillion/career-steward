import type { ResumeExportFormat } from "../domain/resume-export.js";
import type { TailoredResumeRevision } from "../domain/tailored-resume.js";

export const RESUME_RENDERER_VERSION = "resume-renderer/1.0" as const;

export interface RenderedResume {
  format: ResumeExportFormat;
  extension: "md" | "docx";
  mediaType: "text/markdown; charset=utf-8" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  bytes: Buffer;
}

export interface ResumeRenderer {
  readonly format: ResumeExportFormat;
  render(resume: TailoredResumeRevision): Promise<RenderedResume>;
}
