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

export function describeGenerationMode(mode: GenerationMode): string {
  return mode === "auto" ? "Generated automatically" : "Imported from CSV";
}
