/**
 * Scoring for §2.5. Every "was this right?" decision in the app comes from
 * `checkAnswer`, so the score, the review screen and "retake incorrect only"
 * cannot drift apart.
 */
import { checkAnswer } from "./matching";
import type { QuizSession } from "./session";
import type { AttemptAnswer, Question, QuestionType } from "@/lib/types";

export interface TypeBreakdown {
  correct: number;
  total: number;
}

export interface AttemptScore {
  /** Whole-number percentage, 0–100. */
  score: number;
  correctCount: number;
  total: number;
  byType: Record<QuestionType, TypeBreakdown>;
  /** Shaped for the §4 attempt document. */
  answers: AttemptAnswer[];
}

export function scoreAttempt(questions: Question[], session: QuizSession): AttemptScore {
  const byType: Record<QuestionType, TypeBreakdown> = {
    mcq: { correct: 0, total: 0 },
    identification: { correct: 0, total: 0 },
  };

  const answers: AttemptAnswer[] = [];
  let correctCount = 0;

  for (const question of questions) {
    const userAnswer = session.answers[question.id] ?? "";
    // An unanswered question is wrong, not excluded — otherwise skipping
    // everything but one question would score 100%.
    const { correct } = checkAnswer(userAnswer, question);

    byType[question.type].total += 1;
    if (correct) {
      byType[question.type].correct += 1;
      correctCount += 1;
    }

    answers.push({
      questionId: question.id,
      userAnswer,
      isCorrect: correct,
      timeSpentSec: session.seconds[question.id] ?? 0,
    });
  }

  const total = questions.length;
  return {
    score: total === 0 ? 0 : Math.round((correctCount / total) * 100),
    correctCount,
    total,
    byType,
    answers,
  };
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest}s`;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}
