export class ResumeParseError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_FILE_TYPE"
      | "FILE_TOO_LARGE"
      | "INVALID_PDF"
      | "TOO_MANY_PAGES"
      | "NO_EXTRACTABLE_TEXT",
  ) {
    super(message);
    this.name = "ResumeParseError";
  }
}
