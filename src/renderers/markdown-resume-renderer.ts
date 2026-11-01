import type { TailoredResumeRevision } from "../domain/tailored-resume.js";
import type { RenderedResume, ResumeRenderer } from "./resume-renderer.js";

export class MarkdownResumeRenderer implements ResumeRenderer {
  readonly format = "markdown" as const;

  async render(resume: TailoredResumeRevision): Promise<RenderedResume> {
    return {
      format: this.format,
      extension: "md",
      mediaType: "text/markdown; charset=utf-8",
      bytes: Buffer.from(resume.markdown, "utf8"),
    };
  }
}
