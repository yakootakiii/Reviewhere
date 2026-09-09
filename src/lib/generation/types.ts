/**
 * Shared vocabulary for question generation. Both modes (§2.2) end up producing
 * `QuestionDraft`s and nothing downstream can tell which one made them.
 */
import type { Difficulty, Question } from "@/lib/types";

/** An inclusive page range, 1-based to match §2.3 sourcePage. */
export interface QuizScope {
  from: number;
  to: number;
}

export interface QuizSettings {
  questionCount: number;
  /** Percentage of MCQ; identification takes the remainder (§2.2). */
  mcqPct: number;
  difficulty: Difficulty;
  /** null means the whole document. */
  scope: QuizScope | null;
}

/** A validated question that has not been given a Firestore id yet. */
export type QuestionDraft = Omit<Question, "id">;

/**
 * What a validator is checked against. `fallbackDifficulty` exists because the
 * Mode B CSV contract (§2.2.1) has a fixed 10-column header with no difficulty
 * column — those rows inherit the difficulty the user picked for the quiz.
 */
export interface ValidationContext {
  pageCount: number;
  fallbackDifficulty: Difficulty;
}

/** A row that failed validation, kept so the UI can show and fix it (§2.2.1). */
export interface RowError {
  /** Position in the file, counting the header as row 1. */
  rowNumber: number;
  values: Record<string, string>;
  errors: string[];
}

export class GenerationError extends Error {
  /** Plain-language copy, safe to show the user directly (§7.4). */
  readonly userMessage: string;
  /** §3.1: a Mode A failure should offer Mode B rather than dead-end. */
  readonly offerModeB: boolean;

  constructor(userMessage: string, options: { offerModeB?: boolean; cause?: unknown } = {}) {
    super(userMessage);
    this.name = "GenerationError";
    this.userMessage = userMessage;
    this.offerModeB = options.offerModeB ?? false;
    this.cause = options.cause;
  }
}

/** NDJSON events streamed by the Mode A route so progress copy stays honest (§7.7). */
export type GenerationEvent =
  | { type: "progress"; message: string; completed: number; total: number; questions: number }
  | { type: "notice"; message: string }
  | { type: "done"; quizId: string; questionCount: number; requested: number }
  | { type: "error"; message: string; offerModeB: boolean };
