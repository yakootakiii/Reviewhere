"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CardSkeleton, ErrorPanel } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/auth-provider";
import { QuizRunner } from "@/components/quiz/quiz-runner";
import { getQuestions, getQuiz } from "@/lib/firebase/quizzes";
import { saveAttempt } from "@/lib/firebase/attempts";
import { readPersistedJson, usePersistedJson } from "@/lib/persisted-state";
import {
  createSession,
  isUsableSession,
  sessionKey,
  type QuizSession,
} from "@/lib/quiz/session";
import { DEFAULT_PREFERENCES, type Question, type Quiz } from "@/lib/types";

type State =
  | { name: "loading" }
  | { name: "error" }
  | { name: "ready"; quiz: Quiz; questions: Question[] };

export default function TakeQuizPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = use(params);
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [state, setState] = useState<State>({ name: "loading" });
  const [finishing, setFinishing] = useState(false);
  // The session lives in localStorage so leaving mid-quiz loses nothing (§2.4).
  const [session, setSession] = usePersistedJson<QuizSession | null>(sessionKey(quizId), null);

  useEffect(() => {
    if (!user) return;
    let active = true;

    Promise.all([getQuiz(quizId), getQuestions(quizId)])
      .then(([quiz, questions]) => {
        if (!active) return;
        if (!quiz || quiz.ownerId !== user.uid) setState({ name: "error" });
        else setState({ name: "ready", quiz, questions });
      })
      .catch(() => {
        if (active) setState({ name: "error" });
      });

    return () => {
      active = false;
    };
  }, [user, quizId]);

  if (state.name === "loading") {
    return (
      <div className="mx-auto max-w-2xl py-4" aria-busy="true">
        <CardSkeleton />
      </div>
    );
  }

  if (state.name === "error") {
    return (
      <div className="mx-auto max-w-2xl py-4">
        <ErrorPanel
          title="We couldn't open that quiz"
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

  const { quiz, questions } = state;
  const allIds = questions.map((question) => question.id);

  // No usable session means arriving here directly, or a quiz that changed
  // underneath a stale one. Start explicitly rather than silently.
  if (!isUsableSession(session, quizId, allIds)) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 py-10 text-center">
        <h1 className="text-title1">{quiz.title}</h1>
        <p className="text-callout text-secondary">
          {questions.length} questions · {quiz.mix.mcqPct}% multiple choice
        </p>
        <Button onClick={() => setSession(createSession(quizId, allIds))}>Start quiz</Button>
      </div>
    );
  }

  // Captured after the guard above so the async closures below keep the narrowing.
  const active = session;
  const inPlay = active.questionIds
    .map((id) => questions.find((question) => question.id === id))
    .filter((question): question is Question => question !== undefined);

  async function finish() {
    if (!user) return;
    setFinishing(true);
    try {
      // Read the store rather than this render's `session`: the last answer is
      // written in the same handler that finishes, so the closure is a step behind.
      const finished = readPersistedJson<QuizSession | null>(sessionKey(quizId), null) ?? active;
      const { attemptId } = await saveAttempt(user, quiz, inPlay, finished);
      // The sitting is over; clearing it stops "Resume" offering a done quiz.
      setSession(null);
      router.push(`/attempts/${attemptId}`);
    } catch {
      toast("We couldn't save that attempt. Check your connection and try again.", "error");
      setFinishing(false);
    }
  }

  return (
    <div className="py-4">
      <QuizRunner
        questions={inPlay}
        session={active}
        onSession={(update) => setSession((previous) => (previous ? update(previous) : previous))}
        feedbackMode={(profile?.preferences ?? DEFAULT_PREFERENCES).feedbackMode}
        timerEnabled={(profile?.preferences ?? DEFAULT_PREFERENCES).timerEnabled}
        onFinish={finish}
        finishing={finishing}
      />
    </div>
  );
}
