import type { Static } from "typebox";
import { Type } from "typebox";

export const ResumeExportFormatSchema = Type.Union([
  Type.Literal("markdown"),
  Type.Literal("docx"),
]);

export const TailoredResumeExportArtifactSchema = Type.Object({
  opportunityId: Type.String(),
  resumeRevision: Type.Integer({ minimum: 1 }),
  profileRevision: Type.Integer({ minimum: 1 }),
  format: ResumeExportFormatSchema,
  rendererVersion: Type.String(),
  fileName: Type.String(),
  relativePath: Type.String(),
  mediaType: Type.String(),
  byteLength: Type.Integer({ minimum: 1 }),
  sha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
  exportedAt: Type.String(),
});

export type ResumeExportFormat = Static<typeof ResumeExportFormatSchema>;
export type TailoredResumeExportArtifact = Static<
  typeof TailoredResumeExportArtifactSchema
>;
