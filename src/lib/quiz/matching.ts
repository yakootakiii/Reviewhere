/**
 * §2.3 identification matching: exact match with typo tolerance.
 *
 * Deliberately narrow. It forgives a misspelling of the right answer and
 * nothing else — not synonyms, not partial answers, not "close enough in
 * meaning". Widening it into semantic matching would quietly mark wrong
 * answers correct, which is worse than useless in a study tool. The tests in
 * matching.test.ts encode that boundary on purpose.
 */
import type { Question } from "@/lib/types";

/**
 * Case, punctuation and spacing carry no meaning in an answer, so they are
 * removed before comparing. Everything else is significant.
 */
export function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The tolerance the user chose in §10: one edit for short answers, two once
 * there is enough word to misspell. Measured on the normalized target, so
 * punctuation can't inflate the allowance.
 */
export function allowedEdits(normalizedTarget: string): number {
  return normalizedTarget.length < 8 ? 1 : 2;
}

/**
 * Levenshtein distance, abandoned as soon as it provably exceeds `max`. Answers
 * are short, but a user can paste a paragraph into the box and the bound keeps
 * that cheap.
 */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  // A length gap alone already exceeds the budget.
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowBest = current[0];

    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);
      if (current[j] < rowBest) rowBest = current[j];
    }

    // No cell in this row can improve below its minimum on later rows.
    if (rowBest > max) return max + 1;
    [previous, current] = [current, previous];
  }

  return previous[b.length];
}

export interface AnswerCheck {
  correct: boolean;
  /** Which accepted spelling the answer matched, for the review screen. */
  matchedAnswer: string | null;
  /** True when it matched only after forgiving a typo. */
  viaTypo: boolean;
}

const WRONG: AnswerCheck = { correct: false, matchedAnswer: null, viaTypo: false };

/**
 * The single answer check for both question types, so scoring, the review
 * screen and "retake incorrect" can never disagree about what counted.
 */
export function checkAnswer(userAnswer: string, question: Question): AnswerCheck {
  const given = normalizeAnswer(userAnswer ?? "");
  if (!given) return WRONG;

  if (question.type === "mcq") {
    // The stored correctAnswer is the choice text itself (M3 normalizes letter
    // answers away at import), so this is an equality check, never a fuzzy one.
    return normalizeAnswer(question.correctAnswer) === given
      ? { correct: true, matchedAnswer: question.correctAnswer, viaTypo: false }
      : WRONG;
  }

  const targets = [question.correctAnswer, ...(question.acceptedAnswers ?? [])];

  for (const target of targets) {
    if (normalizeAnswer(target) === given) {
      return { correct: true, matchedAnswer: target, viaTypo: false };
    }
  }

  for (const target of targets) {
    const normalized = normalizeAnswer(target);
    if (!normalized) continue;
    const budget = allowedEdits(normalized);
    if (levenshtein(given, normalized, budget) <= budget) {
      return { correct: true, matchedAnswer: target, viaTypo: true };
    }
  }

  return WRONG;
}
