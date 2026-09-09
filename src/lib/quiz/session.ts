/**
 * An in-progress attempt. Kept in localStorage per §2.4 pause/resume: a quiz
 * survives a closed tab without a Firestore write per keystroke, at the cost of
 * not following the user to another device.
 */
import type { Attempt } from "@/lib/types";

export interface QuizSession {
  quizId: string;
  /** Epoch ms, used for the §2.5 "time taken" figure. */
  startedAt: number;
  /** Index into `questionIds`, not into the quiz. */
  index: number;
  /** The questions this sitting covers — a subset when retaking the missed ones. */
  questionIds: string[];
  answers: Record<string, string>;
  /** Wrong tries per question, for the §2.3 reveal-after-two fallback. */
  wrongTries: Record<string, number>;
  revealed: string[];
  seconds: Record<string, number>;
}

export const SESSION_KEY_PREFIX = "reviewhere:session:";

export function sessionKey(quizId: string): string {
  return `${SESSION_KEY_PREFIX}${quizId}`;
}

export function createSession(quizId: string, questionIds: string[]): QuizSession {
  return {
    quizId,
    startedAt: Date.now(),
    index: 0,
    questionIds,
    answers: {},
    wrongTries: {},
    revealed: [],
    seconds: {},
  };
}

/**
 * A stored session is only usable if it still lines up with the quiz — a
 * regenerated or edited quiz invalidates it rather than resuming into
 * questions that no longer exist.
 */
export function isUsableSession(
  session: QuizSession | null,
  quizId: string,
  questionIds: string[],
): session is QuizSession {
  if (!session || session.quizId !== quizId) return false;
  if (session.questionIds.length === 0) return false;
  const available = new Set(questionIds);
  return session.questionIds.every((id) => available.has(id));
}

export function answeredCount(session: QuizSession): number {
  return session.questionIds.filter((id) => (session.answers[id] ?? "").trim() !== "").length;
}

export function isComplete(session: QuizSession): boolean {
  return answeredCount(session) === session.questionIds.length;
}

export function elapsedSeconds(session: QuizSession, now = Date.now()): number {
  return Math.max(0, Math.round((now - session.startedAt) / 1000));
}

/** §2.5 "retake incorrect only" — the questions this attempt got wrong. */
export function incorrectQuestionIds(attempt: Attempt): string[] {
  return attempt.answers.filter((answer) => !answer.isCorrect).map((answer) => answer.questionId);
}

/* ---------------------------------------------------------------- reducers */

/**
 * Session updates live here as pure functions so they compose. They used to be
 * inline object spreads in the runner, each built from the same render-closure
 * `session` — recording an answer and then advancing in the same handler made
 * the second write clobber the first, wiping every answer in end-of-quiz mode.
 * Composing reducers cannot lose a write that way, and it is testable.
 */
export function recordAnswer(
  session: QuizSession,
  questionId: string,
  answer: string,
  correct: boolean,
  seconds: number,
): QuizSession {
  // Only the first submission is scored (§2.3); later tries teach, not count.
  const alreadyAnswered = session.answers[questionId] !== undefined;

  return {
    ...session,
    answers: alreadyAnswered ? session.answers : { ...session.answers, [questionId]: answer },
    wrongTries: correct
      ? session.wrongTries
      : { ...session.wrongTries, [questionId]: (session.wrongTries[questionId] ?? 0) + 1 },
    seconds: {
      ...session.seconds,
      [questionId]: (session.seconds[questionId] ?? 0) + seconds,
    },
  };
}

export function goToIndex(session: QuizSession, index: number): QuizSession {
  return {
    ...session,
    index: Math.min(Math.max(index, 0), session.questionIds.length - 1),
  };
}

export function revealAnswer(session: QuizSession, questionId: string): QuizSession {
  if (session.revealed.includes(questionId)) return session;
  return { ...session, revealed: [...session.revealed, questionId] };
}
