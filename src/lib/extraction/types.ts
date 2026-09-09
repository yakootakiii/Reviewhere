/** One page or slide of extracted text, numbered from 1 to match §2.3 sourcePage. */
export interface ExtractedPage {
  page: number;
  text: string;
}

export interface ExtractionResult {
  pageCount: number;
  pages: ExtractedPage[];
  /**
   * Pages that produced (almost) no text. For PDFs these are usually scans, and
   * are what the §3 OCR fallback would need to handle.
   */
  emptyPages: number[];
  /** Total characters extracted — the signal for "this file is image-only". */
  characterCount: number;
}

export class ExtractionError extends Error {
  /** Plain-language copy, safe to show the user directly (§7.4). */
  readonly userMessage: string;

  constructor(userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = "ExtractionError";
    this.userMessage = userMessage;
    this.cause = cause;
  }
}
