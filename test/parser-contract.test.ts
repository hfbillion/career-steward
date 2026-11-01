import { describe, expect, it } from "vitest";
import { Value } from "typebox/value";

import {
  PARSED_RESUME_SCHEMA_VERSION,
  ParsedResumeDocumentSchema,
} from "../src/parsers/contracts.js";

describe("ParsedResumeDocument contract", () => {
  it("accepts a minimal evidence-preserving document", () => {
    const document = {
      schemaVersion: PARSED_RESUME_SCHEMA_VERSION,
      source: {
        fileName: "resume.pdf",
        mimeType: "application/pdf",
        sha256: "a".repeat(64),
        parserName: "pdfjs",
        parserVersion: "1.0.0",
        pageCount: 1,
      },
      pages: [{ number: 1, lines: [{ number: 1, text: "Ada Lovelace" }] }],
      blocks: [
        {
          id: "p1-l1",
          type: "heading",
          text: "Ada Lovelace",
          source: { page: 1, lineStart: 1, lineEnd: 1 },
        },
      ],
      quality: {
        status: "good",
        confidence: 0.9,
        warnings: [],
        characterCount: 12,
      },
    };

    expect(Value.Check(ParsedResumeDocumentSchema, document)).toBe(true);
  });
});
