import { DEFAULT_PREFERENCES, type UserPreferences } from "@/lib/types";
import { GenerationError, type QuizScope, type QuizSettings } from "./types";

/** §2.2 offers 10/20/30 as presets, plus a custom count. */
export const QUESTION_COUNT_PRESETS = [10, 20, 30] as const;
export const MIN_QUESTIONS = 5;
export const MAX_QUESTIONS = 60;
/** The mix is a coarse dial, not a precision instrument. */
export const MCQ_PCT_STEP = 10;

export function defaultSettings(preferences: UserPreferences = DEFAULT_PREFERENCES): QuizSettings {
  return {
    questionCount: 20,
    mcqPct: preferences.defaultMcqPct,
    difficulty: preferences.defaultDifficulty,
    scope: null,
  };
}

export interface QuestionQuota {
  mcq: number;
  identification: number;
}

/**
 * Splits a total into the two question types. Rounding is done once on the MCQ
 * side and the remainder goes to identification, so the parts always sum to the
 * total the user asked for — an off-by-one here would be visible in the quiz.
 */
export function resolveCounts(questionCount: number, mcqPct: number): QuestionQuota {
  const mcq = Math.round((questionCount * mcqPct) / 100);
  return { mcq, identification: questionCount - mcq };
}

/**
 * Validates settings against the document's real page count. The client sends
 * settings, but the page count is the server's (§2.1), so this runs on both
 * sides and the server's answer is the one that counts.
 */
export function normalizeSettings(input: Partial<QuizSettings>, pageCount: number): QuizSettings {
  const questionCount = Math.trunc(Number(input.questionCount));
  if (!Number.isFinite(questionCount) || questionCount < MIN_QUESTIONS || questionCount > MAX_QUESTIONS) {
    throw new GenerationError(
      `Pick between ${MIN_QUESTIONS} and ${MAX_QUESTIONS} questions.`,
    );
  }

  const mcqPct = Math.trunc(Number(input.mcqPct));
  if (!Number.isFinite(mcqPct) || mcqPct < 0 || mcqPct > 100) {
    throw new GenerationError("The question mix has to be between 0% and 100% multiple choice.");
  }

  const difficulty = input.difficulty ?? "mixed";
  if (!["easy", "medium", "hard", "mixed"].includes(difficulty)) {
    throw new GenerationError("Pick a difficulty: easy, medium, hard, or mixed.");
  }

  return {
    questionCount,
    mcqPct,
    difficulty,
    scope: normalizeScope(input.scope ?? null, pageCount),
  };
}

function normalizeScope(scope: QuizScope | null, pageCount: number): QuizScope | null {
  if (!scope) return null;

  const from = Math.trunc(Number(scope.from));
  const to = Math.trunc(Number(scope.to));
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw new GenerationError("That page range isn't a pair of page numbers.");
  }
  if (from < 1 || to > pageCount) {
    throw new GenerationError(
      `This document has ${pageCount} page${pageCount === 1 ? "" : "s"}, so the range has to sit between 1 and ${pageCount}.`,
    );
  }
  if (from > to) {
    throw new GenerationError("The page range starts after it ends — swap the two numbers.");
  }

  // A range covering everything is the same as no range at all.
  return from === 1 && to === pageCount ? null : { from, to };
}

export function describeScope(scope: QuizScope | null, unit: "pages" | "slides" = "pages"): string {
  if (!scope) return `Whole document`;
  const noun = unit === "slides" ? "Slide" : "Page";
  return scope.from === scope.to
    ? `${noun} ${scope.from}`
    : `${noun}s ${scope.from}–${scope.to}`;
}
