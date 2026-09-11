import { MAX_PAGES, type FileType } from "@/lib/types";
import { extractPdf } from "./pdf";
import { extractPptx } from "./pptx";
import { ExtractionError, type ExtractionResult } from "./types";

export * from "./types";
export { extractPdf } from "./pdf";
export { extractPptx } from "./pptx";

export const ACCEPTED_MIME_TYPES: Record<string, FileType> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

/** Belt and braces: some browsers report an empty or wrong MIME type. */
export function fileTypeFor(fileName: string, mimeType: string): FileType | null {
  const byMime = ACCEPTED_MIME_TYPES[mimeType];
  if (byMime) return byMime;

  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "pdf") return "pdf";
  if (extension === "pptx") return "pptx";
  return null;
}

export async function extractDocument(
  data: Uint8Array,
  fileType: FileType,
): Promise<ExtractionResult> {
  return fileType === "pdf" ? extractPdf(data) : extractPptx(data);
}

/**
 * §2.1: the 150-page cap is enforced here, on the server, against the page
 * count we derived ourselves — never a client-reported number.
 */
export function assertWithinPageLimit(pageCount: number): void {
  if (pageCount > MAX_PAGES) {
    throw new ExtractionError(
      `This file has ${pageCount} pages. Trim it to ${MAX_PAGES} pages or fewer and try again.`,
    );
  }
  if (pageCount === 0) {
    throw new ExtractionError("This file appears to be empty.");
  }
}

/**
 * Distinguishes "scanned document" from "sparse but real".
 *
 * The empty-page ratio alone is not enough: a slide deck of short titles trips
 * it while still being perfectly readable, so a document only counts as a scan
 * when there is essentially no text per page — which is what an image-only
 * scan actually produces.
 *
 * A predicate rather than only an assertion, because a scan is no longer
 * necessarily a rejection: §3.3 offers to read it with OCR instead, and the
 * ingest route needs to ask the question without catching an exception to
 * learn the answer.
 */
const MIN_AVERAGE_CHARS_PER_PAGE = 10;

export function looksLikeScan(result: ExtractionResult): boolean {
  const pageCount = Math.max(result.pageCount, 1);
  const emptyRatio = result.emptyPages.length / pageCount;
  const averageChars = result.characterCount / pageCount;

  return (
    result.characterCount === 0 ||
    (emptyRatio > 0.9 && averageChars < MIN_AVERAGE_CHARS_PER_PAGE)
  );
}

/** The copy shown when a scan can't be offered OCR — a .pptx, or no API key. */
export const SCAN_REJECTION_MESSAGE =
  "We couldn't find any selectable text in this file — it looks like a scan or a set of images. Try a version with real text.";

export function assertHasText(result: ExtractionResult): void {
  if (looksLikeScan(result)) throw new ExtractionError(SCAN_REJECTION_MESSAGE);
}
