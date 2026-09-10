import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { firestore } from "./client";
import { scoreAttempt } from "@/lib/quiz/scoring";
import { elapsedSeconds, type QuizSession } from "@/lib/quiz/session";
import type { Attempt, Question, Quiz } from "@/lib/types";

const attempts = () => collection(firestore(), "attempts");

/**
 * Attempts are the one collection the client writes directly. Documents and
 * quizzes are server-write-only because a forged page count or question would
 * corrupt the material; a forged score only misleads its own author, so the
 * rules already allow owner create/update here.
 */
export async function saveAttempt(
  user: User,
  quiz: Quiz,
  questions: Question[],
  session: QuizSession,
): Promise<{ attemptId: string; score: number }> {
  const result = scoreAttempt(questions, session);

  const reference = await addDoc(attempts(), {
    quizId: quiz.id,
    userId: user.uid,
    startedAt: new Date(session.startedAt),
    completedAt: serverTimestamp(),
    score: result.score,
    durationSec: elapsedSeconds(session),
    answers: result.answers,
  });

  // Only the owner's own sitting updates the quiz's last score: a recipient
  // taking a shared quiz is not the owner's result, and the rules would reject
  // the write anyway — relying on a swallowed permission error to enforce that
  // is not the same as meaning it.
  if (quiz.ownerId === user.uid) {
    updateDoc(doc(firestore(), "quizzes", quiz.id), { lastAttemptScore: result.score }).catch(
      () => {},
    );
  }

  return { attemptId: reference.id, score: result.score };
}

export async function getAttempt(attemptId: string): Promise<Attempt | null> {
  const snapshot = await getDoc(doc(firestore(), "attempts", attemptId));
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Attempt) : null;
}

/** Both filters are needed: rules only permit a query the owner provably scopes. */
export async function listAttempts(uid: string, quizId: string, max = 20): Promise<Attempt[]> {
  const snapshot = await getDocs(
    query(
      attempts(),
      where("userId", "==", uid),
      where("quizId", "==", quizId),
      orderBy("completedAt", "desc"),
      fsLimit(max),
    ),
  );
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as Attempt);
}

/**
 * Unlike documents and quizzes this needs no API route: an attempt has no
 * subcollections to orphan, and the rules already let an owner delete their own.
 */
export function deleteAttempt(attemptId: string) {
  return deleteDoc(doc(firestore(), "attempts", attemptId));
}

export function bestScore(history: Attempt[]): number | null {
  return history.length === 0 ? null : Math.max(...history.map((attempt) => attempt.score));
}
