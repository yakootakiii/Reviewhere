"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardSkeleton, ErrorPanel } from "@/components/ui/feedback";
import { useAuth } from "@/components/auth/auth-provider";
import { ReviewList } from "@/components/quiz/review-list";
import { ScoreRing } from "@/components/quiz/score-ring";
import { getAttempt } from "@/lib/firebase/attempts";
import { getDocument } from "@/lib/firebase/documents";
import { getQuestions, getQuiz } from "@/lib/firebase/quizzes";
import { usePersistedJson } from "@/lib/persisted-state";
import { formatDuration } from "@/lib/quiz/scoring";
import { createSession, incorrectQuestionIds, sessionKey, type QuizSession } from "@/lib/quiz/session";
import type { Attempt, Question, Quiz } from "@/lib/types";

type State =
  | { name: "loading" }
  | { name: "error" }
  | { name: "ready"; attempt: Attempt; quiz: Quiz; questions: Question[]; sourceExists: boolean };

/** §2.5 results: score, time, breakdown by type, and the full review list. */
export default function AttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<State>({ name: "loading" });
  const [quizId, setQuizId] = useState<string>("");
  const [, setSession] = usePersistedJson<QuizSession | null>(sessionKey(quizId), null);

  useEffect(() => {
    if (!user) return;
    let active = true;

    getAttempt(attemptId)
      .then(async (attempt) => {
        if (!attempt || attempt.userId !== user.uid) throw new Error("not found");
        const [quiz, questions] = await Promise.all([
          getQuiz(attempt.quizId),
          getQuestions(attempt.quizId),
        ]);
        if (!quiz) throw new Error("not found");
        // Page links only make sense while the source document still exists.
        const source = await getDocument(quiz.documentId).catch(() => null);
        if (!active) return;
        setQuizId(quiz.id);
        setState({ name: "ready", attempt, quiz, questions, sourceExists: source !== null });
      })
      .catch(() => {
        if (active) setState({ name: "error" });
      });

    return () => {
      active = false;
    };
  }, [user, attemptId]);

  if (state.name === "loading") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 py-4" aria-busy="true">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (state.name === "error") {
    return (
      <div className="mx-auto max-w-3xl py-4">
        <ErrorPanel
          title="We couldn't open that attempt"
          description="It may have been deleted, or it belongs to another account."
          action={
            <Link href="/library">
              <Button variant="secondary">Back to library</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const { attempt, quiz, questions, sourceExists } = state;
  // Only the questions this sitting actually covered — a "retake incorrect"
  // attempt is a subset of the quiz.
  const answeredIds = new Set(attempt.answers.map((answer) => answer.questionId));
  const covered = questions.filter((question) => answeredIds.has(question.id));
  const missed = incorrectQuestionIds(attempt);

  const byType = covered.reduce(
    (totals, question) => {
      const correct = attempt.answers.find((answer) => answer.questionId === question.id)?.isCorrect;
      totals[question.type].total += 1;
      if (correct) totals[question.type].correct += 1;
      return totals;
    },
    { mcq: { correct: 0, total: 0 }, identification: { correct: 0, total: 0 } },
  );

  function retakeIncorrect() {
    setSession(createSession(quiz.id, missed));
    router.push(`/quizzes/${quiz.id}/take`);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 py-4">
      <div className="flex flex-col gap-4">
        <Link
          href={`/quizzes/${quiz.id}`}
          className="inline-flex w-fit items-center gap-1.5 rounded-md text-caption text-secondary hover:text-primary"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {quiz.title}
        </Link>

        <Card className="flex flex-col items-center gap-5 p-6 sm:flex-row sm:gap-8">
          <ScoreRing score={attempt.score} />
          <div className="flex flex-1 flex-col gap-3 text-center sm:text-left">
            <div className="flex flex-col gap-1">
              <h1 className="text-title1">
                {attempt.answers.filter((answer) => answer.isCorrect).length} of{" "}
                {attempt.answers.length} correct
              </h1>
              {attempt.durationSec !== undefined && (
                <p className="text-callout text-secondary">
                  Time taken: {formatDuration(attempt.durationSec)}
                </p>
              )}
            </div>

            <dl className="flex flex-col gap-1 text-callout">
              {byType.mcq.total > 0 && (
                <div className="flex justify-between gap-4 sm:justify-start">
                  <dt className="text-secondary">Multiple choice</dt>
                  <dd className="tabular-nums">
                    {byType.mcq.correct}/{byType.mcq.total}
                  </dd>
                </div>
              )}
              {byType.identification.total > 0 && (
                <div className="flex justify-between gap-4 sm:justify-start">
                  <dt className="text-secondary">Identification</dt>
                  <dd className="tabular-nums">
                    {byType.identification.correct}/{byType.identification.total}
                  </dd>
                </div>
              )}
            </dl>

            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              {missed.length > 0 && (
                <Button onClick={retakeIncorrect}>
                  <RotateCcw aria-hidden className="size-[18px]" />
                  Retake {missed.length} incorrect
                </Button>
              )}
              <Link href={`/quizzes/${quiz.id}`}>
                <Button variant="secondary">Quiz overview</Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-title2">Review</h2>
        <ReviewList
          questions={covered}
          answers={attempt.answers}
          documentId={sourceExists ? quiz.documentId : undefined}
        />
      </section>
    </div>
  );
}
