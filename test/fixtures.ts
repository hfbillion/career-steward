import type { ParsedResumeDocument } from "../src/parsers/contracts.js";

export const SOURCE_DOCUMENT_ID = "b".repeat(64);

export function createParsedResumeDocument(): ParsedResumeDocument {
  return {
    schemaVersion: "1.0",
    source: {
      fileName: "ada-resume.pdf",
      mimeType: "application/pdf",
      sha256: SOURCE_DOCUMENT_ID,
      parserName: "pdfjs",
      parserVersion: "6.4.299",
      pageCount: 1,
    },
    pages: [
      {
        number: 1,
        lines: [
          { number: 1, text: "Ada Lovelace" },
          { number: 2, text: "Analytical Engines Ltd. — Software Architect" },
          { number: 3, text: "Designed reliable distributed analytical systems" },
          { number: 4, text: "TypeScript, PostgreSQL, distributed systems" },
        ],
      },
    ],
    blocks: [
      {
        id: "p1-l1",
        type: "heading",
        text: "Ada Lovelace",
        source: { page: 1, lineStart: 1, lineEnd: 1 },
      },
      {
        id: "p1-l2",
        type: "heading",
        text: "Analytical Engines Ltd. — Software Architect",
        source: { page: 1, lineStart: 2, lineEnd: 2 },
      },
      {
        id: "p1-l3",
        type: "paragraph",
        text: "Designed reliable distributed analytical systems",
        source: { page: 1, lineStart: 3, lineEnd: 3 },
      },
      {
        id: "p1-l4",
        type: "paragraph",
        text: "TypeScript, PostgreSQL, distributed systems",
        source: { page: 1, lineStart: 4, lineEnd: 4 },
      },
    ],
    quality: {
      status: "good",
      confidence: 0.9,
      warnings: [],
      characterCount: 142,
    },
  };
}
