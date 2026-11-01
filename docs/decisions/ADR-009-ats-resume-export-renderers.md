# ADR-009: ATS Resume Export Renderers

- Status: Accepted
- Date: 2026-11-01
- Renderer version: `resume-renderer/1.0`

## Context

Confirmed tailored CVs currently exist as structured data plus canonical
Markdown. A user needs real files for review and application, but exporting must
not introduce claims, reorder evidence, or make vendor-specific ATS promises.
Formatting code also needs to remain independent from Pi and from the domain
rules that generated the CV.

## Decision

`TailoredResumeRevision` is the only export input. A `ResumeRenderer` converts
that confirmed revision to bytes without changing wording or adding content.
Version 1.0 provides:

- `MarkdownResumeRenderer`, which writes the canonical Markdown byte-for-byte;
- `DocxResumeRenderer`, which renders the structured revision as a single-column
  Letter document with standard headings, readable Arial text, real list
  paragraphs, and no tables, images, text boxes, columns, headers, or footers.

The DOCX renderer reads structured fields rather than reparsing Markdown. Both
representations therefore originate from the same confirmed artifact while
remaining appropriate to their target formats.

## Filesystem boundary

Exports are local files under the trusted workspace. The default directory is
`career-steward-exports`. A custom directory is checked before and after
creation so absolute paths, traversal, and symlinks cannot escape the workspace.
Generated file names are sanitized and pin the opportunity and CV revision.

Writes use exclusive creation with private file permissions. An existing path
is never silently overwritten. The result records relative path, media type,
byte length, SHA-256, renderer version, and source revision provenance.

## ATS boundary

The layout avoids structures commonly mishandled by parsers and preserves a
linear reading order. This is an ATS compatibility strategy, not a guarantee of
acceptance, parsing fidelity, or ranking by any specific vendor. Visual render
inspection remains a release requirement for the DOCX renderer.

PDF export is deferred. It will be a separate renderer because pagination,
font embedding, and platform conversion require their own deterministic and
visual validation policy.
