import type { Static } from "typebox";
import { Type } from "typebox";

export const PARSED_RESUME_SCHEMA_VERSION = "1.0" as const;

export const ParsedLineSchema = Type.Object({
  number: Type.Integer({ minimum: 1 }),
  text: Type.String(),
});

export const ParsedPageSchema = Type.Object({
  number: Type.Integer({ minimum: 1 }),
  lines: Type.Array(ParsedLineSchema),
});

export const ParsedBlockSchema = Type.Object({
  id: Type.String(),
  type: Type.Union([
    Type.Literal("heading"),
    Type.Literal("paragraph"),
    Type.Literal("list-item"),
    Type.Literal("table"),
    Type.Literal("unknown"),
  ]),
  text: Type.String(),
  source: Type.Object({
    page: Type.Integer({ minimum: 1 }),
    lineStart: Type.Integer({ minimum: 1 }),
    lineEnd: Type.Integer({ minimum: 1 }),
  }),
});

export const ParsedResumeDocumentSchema = Type.Object({
  schemaVersion: Type.Literal(PARSED_RESUME_SCHEMA_VERSION),
  source: Type.Object({
    fileName: Type.String(),
    mimeType: Type.Literal("application/pdf"),
    sha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    parserName: Type.Literal("pdfjs"),
    parserVersion: Type.String(),
    pageCount: Type.Integer({ minimum: 1 }),
  }),
  pages: Type.Array(ParsedPageSchema),
  blocks: Type.Array(ParsedBlockSchema),
  quality: Type.Object({
    status: Type.Union([
      Type.Literal("good"),
      Type.Literal("partial"),
      Type.Literal("failed"),
    ]),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    warnings: Type.Array(Type.String()),
    characterCount: Type.Integer({ minimum: 0 }),
  }),
});

export type ParsedLine = Static<typeof ParsedLineSchema>;
export type ParsedPage = Static<typeof ParsedPageSchema>;
export type ParsedBlock = Static<typeof ParsedBlockSchema>;
export type ParsedResumeDocument = Static<typeof ParsedResumeDocumentSchema>;

export interface ParseResumeInput {
  fileName: string;
  mimeType: "application/pdf";
  bytes: Uint8Array;
}

export interface DocumentParser {
  readonly name: string;
  readonly supportedMimeTypes: readonly string[];
  parse(input: ParseResumeInput): Promise<ParsedResumeDocument>;
}
