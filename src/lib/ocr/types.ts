/**
 * The OCR route streams these as NDJSON, the same shape `GenerationEvent` uses:
 * transcribing forty pages runs well past a spinner's welcome, and §7.7 asks
 * for honest progress copy rather than a fabricated percentage.
 */
export type OcrEvent =
  | { type: "progress"; message: string; completed: number; total: number; characters: number }
  | { type: "notice"; message: string }
  | {
      type: "done";
      /** Pages that produced text, in page order. */
      pages: number[];
      /** Pages attempted that came back blank or unreadable. */
      skipped: number[];
      characters: number;
      model: string | null;
    }
  | { type: "error"; message: string };

export interface OcrPageResult {
  page: number;
  text: string;
  model: string | null;
}
