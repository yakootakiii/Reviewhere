import type { ExtractedPage, ExtractionResult } from "./types";

/** A page with less than this much text is treated as effectively blank. */
const MIN_MEANINGFUL_CHARS = 20;

export function summarize(pages: ExtractedPage[], pageCount: number): ExtractionResult {
  const emptyPages = pages
    .filter((page) => page.text.trim().length < MIN_MEANINGFUL_CHARS)
    .map((page) => page.page);

  return {
    pageCount,
    pages,
    emptyPages,
    characterCount: pages.reduce((total, page) => total + page.text.length, 0),
  };
}
