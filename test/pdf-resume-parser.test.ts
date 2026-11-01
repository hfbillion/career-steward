import { describe, expect, it } from "vitest";

import { PdfResumeParser } from "../src/parsers/pdf/pdf-resume-parser.js";

function buildTextPdf(lines: string[]): Uint8Array {
  const content = [
    "BT",
    "/F1 12 Tf",
    "72 720 Td",
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
    `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

describe("PdfResumeParser", () => {
  it("extracts text and stable evidence locations from a text PDF", async () => {
    const parser = new PdfResumeParser();
    const bytes = buildTextPdf([
      "Ada Lovelace - Software Architect",
      "Designed reliable distributed systems for analytical workloads",
      "Reduced critical processing latency by forty five percent",
      "Led architecture reviews across platform data and application teams",
      "Introduced observability standards for services and asynchronous jobs",
      "Mentored engineers on system design testing and incident response",
      "Built deployment safeguards that reduced production change failures",
      "Partnered with product leaders to define measurable technical outcomes",
      "Improved database access patterns and lowered peak infrastructure cost",
      "Documented architectural decisions and long term modernization plans",
    ]);

    const document = await parser.parse({
      fileName: "/private/input/ada-resume.pdf",
      mimeType: "application/pdf",
      bytes,
    });

    expect(document.source.fileName).toBe("ada-resume.pdf");
    expect(document.source.pageCount).toBe(1);
    expect(document.source.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(document.blocks.map((block) => block.text).join(" ")).toContain("Ada Lovelace");
    expect(document.blocks[0]?.source.page).toBe(1);
    expect(document.quality.status).toBe("good");
  });

  it("rejects files without a PDF signature", async () => {
    const parser = new PdfResumeParser();

    await expect(
      parser.parse({
        fileName: "resume.pdf",
        mimeType: "application/pdf",
        bytes: new TextEncoder().encode("not a pdf"),
      }),
    ).rejects.toMatchObject({ code: "INVALID_PDF" });
  });
});
