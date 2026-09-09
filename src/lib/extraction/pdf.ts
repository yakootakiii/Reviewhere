import { extractText, getDocumentProxy } from "unpdf";
import { ExtractionError, type ExtractionResult } from "./types";
import { summarize } from "./summarize";

/**
 * Text + page count from a PDF. unpdf wraps pdf.js with no native bindings, so
 * this runs in a serverless function without a custom build.
 */
export async function extractPdf(data: Uint8Array): Promise<ExtractionResult> {
  let pageTexts: string[];
  let totalPages: number;

  try {
    const pdf = await getDocumentProxy(data);
    const result = await extractText(pdf, { mergePages: false });
    totalPages = result.totalPages;
    pageTexts = result.text;
  } catch (cause) {
    throw new ExtractionError(
      "We couldn't read this PDF. It may be password-protected or corrupted.",
      cause,
    );
  }

  return summarize(
    pageTexts.map((text, index) => ({ page: index + 1, text: normalize(text) })),
    totalPages,
  );
}

/** pdf.js emits per-item text; collapse the ragged whitespace it leaves behind. */
function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
