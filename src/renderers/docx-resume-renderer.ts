import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageOrientation,
  Paragraph,
  TextRun,
} from "docx";

import type { TailoredResumeRevision } from "../domain/tailored-resume.js";
import type { RenderedResume, ResumeRenderer } from "./resume-renderer.js";

const FONT = "Arial";
const BLACK = "000000";

function textRun(
  text: string,
  options: { bold?: boolean; italics?: boolean; size?: number } = {},
): TextRun {
  return new TextRun({
    text,
    font: FONT,
    color: BLACK,
    ...(options.bold === undefined ? {} : { bold: options.bold }),
    ...(options.italics === undefined ? {} : { italics: options.italics }),
    ...(options.size === undefined ? {} : { size: options.size }),
  });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    keepNext: true,
    children: [textRun(text, { bold: true, size: 24 })],
  });
}

export class DocxResumeRenderer implements ResumeRenderer {
  readonly format = "docx" as const;

  async render(resume: TailoredResumeRevision): Promise<RenderedResume> {
    const children: Paragraph[] = [];
    const candidateName = resume.contact.name ?? "Candidate";
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        keepNext: true,
        children: [textRun(candidateName, { bold: true, size: 36 })],
      }),
    );

    const contact = [resume.contact.email, resume.contact.phone].filter(
      (value): value is string => Boolean(value),
    );
    if (contact.length > 0) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          keepNext: true,
          children: [textRun(contact.join(" | "), { size: 20 })],
        }),
      );
    }

    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        keepNext: true,
        children: [
          textRun(`Target Role: ${resume.targetJobTitle}`, { bold: true, size: 21 }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [textRun(resume.headline.text, { italics: true, size: 21 })],
      }),
      sectionHeading("Professional Summary"),
      new Paragraph({
        children: [textRun(resume.professionalSummary.text)],
      }),
    );

    if (resume.experiences.length > 0) {
      children.push(sectionHeading("Experience"));
      for (const experience of resume.experiences) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            keepNext: true,
            children: [
              textRun(`${experience.title} | ${experience.company}`, {
                bold: true,
                size: 21,
              }),
            ],
          }),
        );
        const dates = [experience.startDate, experience.endDate].filter(
          (value): value is string => Boolean(value),
        );
        if (dates.length > 0) {
          children.push(
            new Paragraph({
              keepNext: true,
              children: [textRun(dates.join(" - "), { italics: true, size: 20 })],
            }),
          );
        }
        for (const bullet of experience.bullets) {
          children.push(
            new Paragraph({
              numbering: { reference: "resume-bullets", level: 0 },
              children: [textRun(bullet.text)],
            }),
          );
        }
      }
    }

    if (resume.skills.length > 0) {
      children.push(
        sectionHeading("Skills"),
        new Paragraph({
          children: [textRun(resume.skills.map((skill) => skill.value).join(", "))],
        }),
      );
    }

    if (resume.education.length > 0) {
      children.push(sectionHeading("Education"));
      for (const education of resume.education) {
        children.push(
          new Paragraph({
            numbering: { reference: "resume-bullets", level: 0 },
            children: [textRun(education)],
          }),
        );
      }
    }

    const document = new Document({
      title: `${candidateName} Resume`,
      subject: `Application for ${resume.targetJobTitle}`,
      creator: "Career Steward",
      lastModifiedBy: "Career Steward",
      revision: resume.revision,
      description:
        "ATS-compatible single-column resume exported from a confirmed Career Steward revision.",
      styles: {
        default: {
          document: {
            run: { font: FONT, size: 21, color: BLACK },
            paragraph: {
              spacing: { after: 80, line: 276 },
            },
          },
          title: {
            run: { font: FONT, size: 36, bold: true, color: BLACK },
            paragraph: {
              alignment: AlignmentType.CENTER,
              spacing: { after: 80 },
              keepNext: true,
            },
          },
          heading1: {
            run: { font: FONT, size: 24, bold: true, color: BLACK },
            paragraph: {
              spacing: { before: 160, after: 60 },
              keepNext: true,
              outlineLevel: 0,
            },
          },
          heading2: {
            run: { font: FONT, size: 21, bold: true, color: BLACK },
            paragraph: {
              spacing: { before: 100, after: 30 },
              keepNext: true,
              outlineLevel: 1,
            },
          },
        },
      },
      numbering: {
        config: [
          {
            reference: "resume-bullets",
            levels: [
              {
                level: 0,
                format: LevelFormat.BULLET,
                text: "•",
                alignment: AlignmentType.LEFT,
                style: {
                  run: { font: FONT, color: BLACK },
                  paragraph: {
                    indent: { left: 360, hanging: 180 },
                    spacing: { after: 40 },
                  },
                },
              },
            ],
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              size: {
                width: 12_240,
                height: 15_840,
                orientation: PageOrientation.PORTRAIT,
              },
              margin: {
                top: 720,
                right: 900,
                bottom: 720,
                left: 900,
              },
            },
          },
          children,
        },
      ],
    });

    return {
      format: this.format,
      extension: "docx",
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: await Packer.toBuffer(document),
    };
  }
}
