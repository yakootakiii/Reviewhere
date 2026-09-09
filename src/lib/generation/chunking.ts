/**
 * Turns extracted page text into chunks sized for a single model call (§2.2
 * step 1). Chunks never straddle a page boundary in a way that loses the page
 * number, because every question has to be able to cite a real sourcePage.
 */
import type { ExtractedPage } from "@/lib/extraction/types";
import type { QuizScope } from "./types";

/** Roughly 3K tokens of context per call, well inside every model in the chain. */
export const CHUNK_CHAR_BUDGET = 12_000;
/**
 * A ceiling on model calls per generation. Free-tier latency is the binding
 * constraint (§3.1), so a 150-page document samples evenly rather than walking
 * every page.
 */
export const MAX_CHUNKS = 8;
/** Pages below this are the blank ones the extractor already flagged. */
const MIN_MEANINGFUL_CHARS = 20;

export interface TextChunk {
  from: number;
  to: number;
  text: string;
  /** How many questions this chunk is asked for. Assigned by `buildChunks`. */
  quota: number;
}

export function selectPages(pages: ExtractedPage[], scope: QuizScope | null): ExtractedPage[] {
  return pages
    .filter((page) => !scope || (page.page >= scope.from && page.page <= scope.to))
    .filter((page) => page.text.trim().length >= MIN_MEANINGFUL_CHARS)
    .sort((a, b) => a.page - b.page);
}

/** Groups whole pages into chunks under the character budget. */
export function chunkPages(pages: ExtractedPage[], budget = CHUNK_CHAR_BUDGET): TextChunk[] {
  const chunks: TextChunk[] = [];
  let current: ExtractedPage[] = [];
  let size = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push({
      from: current[0].page,
      to: current[current.length - 1].page,
      // The markers are what let the model cite a page it actually read.
      text: current.map((page) => `--- Page ${page.page} ---\n${page.text.trim()}`).join("\n\n"),
      quota: 0,
    });
    current = [];
    size = 0;
  };

  for (const page of pages) {
    const length = page.text.trim().length;
    if (current.length > 0 && size + length > budget) flush();
    current.push(page);
    size += length;
    // A single page over budget still gets its own chunk rather than being cut.
    if (size >= budget) flush();
  }
  flush();

  return chunks;
}

/** Keeps at most `max` chunks, spread evenly across the document. */
export function sampleEvenly<T>(items: T[], max: number): T[] {
  if (items.length <= max || max <= 0) return [...items];
  const step = items.length / max;
  return Array.from({ length: max }, (_, index) => items[Math.floor(index * step)]);
}

/**
 * Spreads the question total across chunks in proportion to how much text each
 * holds, then hands the rounding remainder to the largest chunks so the quotas
 * add up to exactly what the user asked for.
 */
export function assignQuotas(chunks: TextChunk[], total: number): TextChunk[] {
  if (chunks.length === 0) return [];

  const characters = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0) || 1;
  const exact = chunks.map((chunk) => (chunk.text.length / characters) * total);
  const quotas = exact.map((value) => Math.floor(value));

  let remaining = total - quotas.reduce((sum, value) => sum + value, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);

  for (const { index } of byRemainder) {
    if (remaining <= 0) break;
    quotas[index] += 1;
    remaining -= 1;
  }

  return chunks.map((chunk, index) => ({ ...chunk, quota: quotas[index] }));
}

/**
 * The whole pipeline: scope → chunk → cap → quota. Chunks that would be asked
 * for zero questions are dropped, so a small quiz over a big document makes a
 * few focused calls instead of many empty ones.
 */
export function buildChunks(
  pages: ExtractedPage[],
  scope: QuizScope | null,
  questionCount: number,
  options: { budget?: number; maxChunks?: number } = {},
): TextChunk[] {
  const selected = selectPages(pages, scope);
  const chunked = chunkPages(selected, options.budget ?? CHUNK_CHAR_BUDGET);
  const capped = sampleEvenly(chunked, Math.min(options.maxChunks ?? MAX_CHUNKS, questionCount));
  return assignQuotas(capped, questionCount).filter((chunk) => chunk.quota > 0);
}
