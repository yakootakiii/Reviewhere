/** Quiz helpers shared by the generation routes and the client UI. */
import type { FileType, GenerationMode } from "@/lib/types";

/**
 * The slice of a document the generation flow needs. Narrower than
 * `StudyDocument` so the upload flow can start generating from its ingest
 * result without first re-reading the saved document.
 */
export interface QuizSource {
  id: string;
  fileName: string;
  pageCount: number;
  fileType: FileType;
}

/** A quiz is named after its source document, minus the file extension. */
export function quizTitleFor(fileName: string): string {
  return fileName.replace(/\.(pdf|pptx)$/i, "").trim() || "Untitled quiz";
}

/**
 * A quiz is shared with named people, not published. The cap keeps the uid
 * array small enough to live on the quiz document and read cheaply in rules.
 */
export const MAX_SHARE_RECIPIENTS = 10;

export interface ShareRecipient {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export function describeGenerationMode(mode: GenerationMode): string {
  return mode === "auto" ? "Generated automatically" : "Imported from CSV";
}
