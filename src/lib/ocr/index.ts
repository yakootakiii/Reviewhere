/**
 * OCR for scanned and handwritten notes (§3.3).
 *
 * Deliberately separate from `src/lib/extraction/`: extraction is pure and
 * offline, tested against real file bytes with no network, and that property is
 * worth keeping. This module needs the network, so it lives on its own side of
 * the line and is called by the OCR route rather than by the ingest parser.
 *
 * What it produces is ordinary page text. It is written into
 * `/documents/{id}/pages/{n}` exactly as PDF extraction's output is, so
 * chunking, both generation modes, `sourcePage`, the review screen and
 * regeneration need to know nothing about where the text came from.
 */

export { encodePng, toDataUrl, type RawImage } from "./png";
export { downscale, MAX_EDGE } from "./downscale";
export { openPdf, extractPageImage, type PdfProxy } from "./page-images";
export {
  transcribePage,
  visionChain,
  cleanTranscription,
  VisionUnavailable,
  DEFAULT_VISION_CHAIN,
  TRANSCRIBE_PROMPT,
  type PageTranscription,
} from "./transcribe";
export type { OcrEvent, OcrPageResult } from "./types";

/** A function rather than a const so tests and the route see the live env. */
export function isOcrConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}
