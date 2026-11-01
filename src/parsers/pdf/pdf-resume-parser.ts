import { createHash } from "node:crypto";
import { basename } from "node:path";

import pdfjsPackage from "pdfjs-dist/package.json" with { type: "json" };
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import { ResumeParseError } from "../../domain/errors.js";
import {
  PARSED_RESUME_SCHEMA_VERSION,
  type DocumentParser,
  type ParseResumeInput,
  type ParsedBlock,
  type ParsedLine,
  type ParsedResumeDocument,
} from "../contracts.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PAGE_COUNT = 10;
const MIN_EXTRACTABLE_CHARACTERS = 80;

interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
}

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return typeof item === "object" && item !== null && "str" in item;
}

function extractLines(items: unknown[]): ParsedLine[] {
  const values: string[] = [];
  let current = "";

  const flush = () => {
    const normalized = current.replace(/\s+/g, " ").trim();
    if (normalized.length > 0) values.push(normalized);
    current = "";
  };

  for (const item of items) {
    if (!isPdfTextItem(item)) continue;

    const text = item.str.trim();
    if (text.length > 0) {
      current = current.length === 0 ? text : `${current} ${text}`;
    }

    if (item.hasEOL) flush();
  }

  flush();

  return values.map((text, index) => ({ number: index + 1, text }));
}

function inferBlockType(text: string): ParsedBlock["type"] {
  if (/^[•●▪◦*-]\s+/.test(text)) return "list-item";
  if (text.length <= 48 && !/[.!?。！？]$/.test(text)) return "heading";
  return "paragraph";
}

export class PdfResumeParser implements DocumentParser {
  readonly name = "pdfjs";
  readonly supportedMimeTypes = ["application/pdf"] as const;

  async parse(input: ParseResumeInput): Promise<ParsedResumeDocument> {
    if (input.mimeType !== "application/pdf") {
      throw new ResumeParseError(
        `Unsupported resume type: ${input.mimeType}`,
        "INVALID_FILE_TYPE",
      );
    }

    if (input.bytes.byteLength > MAX_FILE_BYTES) {
      throw new ResumeParseError(
        `PDF exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB limit`,
        "FILE_TOO_LARGE",
      );
    }

    const header = new TextDecoder("ascii").decode(input.bytes.slice(0, 5));
    if (header !== "%PDF-") {
      throw new ResumeParseError("File does not have a valid PDF header", "INVALID_PDF");
    }

    let document: Awaited<ReturnType<typeof getDocument>["promise"]>;
    try {
      document = await getDocument({
        data: input.bytes,
        useSystemFonts: true,
      }).promise;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ResumeParseError(`Unable to open PDF: ${message}`, "INVALID_PDF");
    }

    if (document.numPages > MAX_PAGE_COUNT) {
      throw new ResumeParseError(
        `Resume has ${document.numPages} pages; maximum is ${MAX_PAGE_COUNT}`,
        "TOO_MANY_PAGES",
      );
    }

    const pages = [];
    const blocks: ParsedBlock[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const lines = extractLines(textContent.items);

      pages.push({ number: pageNumber, lines });
      for (const line of lines) {
        blocks.push({
          id: `p${pageNumber}-l${line.number}`,
          type: inferBlockType(line.text),
          text: line.text,
          source: {
            page: pageNumber,
            lineStart: line.number,
            lineEnd: line.number,
          },
        });
      }
    }

    const characterCount = blocks.reduce((total, block) => total + block.text.length, 0);
    if (characterCount < MIN_EXTRACTABLE_CHARACTERS) {
      throw new ResumeParseError(
        "PDF contains too little extractable text; scanned PDFs are not supported yet",
        "NO_EXTRACTABLE_TEXT",
      );
    }

    const warnings: string[] = [];
    if (characterCount < 400) {
      warnings.push("The extracted resume text is unusually short and needs review.");
    }

    return {
      schemaVersion: PARSED_RESUME_SCHEMA_VERSION,
      source: {
        fileName: basename(input.fileName),
        mimeType: "application/pdf",
        sha256: createHash("sha256").update(input.bytes).digest("hex"),
        parserName: "pdfjs",
        parserVersion: pdfjsPackage.version,
        pageCount: document.numPages,
      },
      pages,
      blocks,
      quality: {
        status: warnings.length === 0 ? "good" : "partial",
        confidence: warnings.length === 0 ? 0.9 : 0.65,
        warnings,
        characterCount,
      },
    };
  }
}
