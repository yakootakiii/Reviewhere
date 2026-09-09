"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, History, Play, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CardSkeleton, EmptyState, ErrorPanel } from "@/components/ui/feedback";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/auth-provider";
import { bestScore, deleteAttempt, listAttempts } from "@/lib/firebase/attempts";
import { getDocument } from "@/lib/firebase/documents";
import { getQuestions, getQuiz } from "@/lib/firebase/quizzes";
import { usePersistedJson } from "@/lib/persisted-state";
import { describeGenerationMode } from "@/lib/quiz-shared";
import { describeScope } from "@/lib/generation/settings";
import { formatDuration } from "@/lib/quiz/scoring";
import {
  answeredCount,
  createSession,
  isUsableSession,
  sessionKey,
  type QuizSession,
} from "@/lib/quiz/session";
import type { Attempt, Question, Quiz } from "@/lib/types";

type State =
  | { name: "loading" }
  | { name: "error" }
  | { name: "ready"; quiz: Quiz; questions: Question[]; attempts: Attempt[]; sourceExists: boolean };

/**
 * The quiz overview. It deliberately does not list the questions: this page is
 * the doorway to taking the quiz, and showing the answers here would defeat it.
 * The questions are visible afterwards, in the review screen.
 */
export default function QuizPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = use(params);
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [state, setState] = useState<State>({ name: "loading" });
  const [session, setSession] = usePersistedJson<QuizSession | null>(sessionKey(quizId), null);
  const [removing, setRemoving] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;

    Promise.all([getQuiz(quizId), getQuestions(quizId), listAttempts(user.uid, quizId)])
      .then(async ([quiz, questions, attempts]) => {
        if (!quiz || quiz.ownerId !== user.uid) {
          if (active) setState({ name: "error" });
          return;
        }
        // A quiz outlives its document (M5): questions were copied in at
        // generation time, so it still plays — only the page links go dead.
        const source = await getDocument(quiz.documentId).catch(() => null);
        if (!active) return;
        setState({ name: "ready", quiz, questions, attempts, sourceExists: source !== null });
      })
      .catch(() => {
        if (active) setState({ name: "error" });
      });

    return () => {
      active = false;
    };
  }, [user, quizId, reloadKey]);

  async function onDeleteAttempt() {
    if (!removing) return;
    setBusy(true);
    try {
      await deleteAttempt(removing.id);
      toast("Attempt deleted.", "success");
      setRemoving(null);
      setReloadKey((key) => key + 1);
    } catch {
      toast("Couldn't delete that attempt. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

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

  const { quiz, questions, attempts, sourceExists } = state;
  const allIds = questions.map((question) => question.id);
  const resumable = isUsableSession(session, quizId, allIds) ? session : null;
  const best = bestScore(attempts);

  function start(fresh: boolean) {
    if (fresh) setSession(createSession(quizId, allIds));
    router.push(`/quizzes/${quizId}/take`);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 py-4">
      <div className="flex flex-col gap-4">
        {sourceExists ? (
          <Link
            href={`/documents/${quiz.documentId}`}
            className="inline-flex w-fit items-center gap-1.5 rounded-md text-caption text-secondary hover:text-primary"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Back to document
          </Link>
        ) : (
          <Link
            href="/library"
            className="inline-flex w-fit items-center gap-1.5 rounded-md text-caption text-secondary hover:text-primary"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Library
          </Link>
        )}

        <div className="flex flex-col gap-1">
          <h1 className="text-display break-words">{quiz.title}</h1>
          <p className="text-callout text-secondary">
            {questions.length} questions · {quiz.mix.mcqPct}% multiple choice ·{" "}
            <span className="capitalize">{quiz.difficulty}</span> ·{" "}
            {describeScope(quiz.scope ?? null)}
          </p>
          <p className="text-caption text-tertiary">
            {describeGenerationMode(quiz.generationMode)}
            {!sourceExists && " · source document deleted"}
          </p>
        </div>

        {(best !== null || attempts.length > 0) && (
          <div className="flex flex-wrap gap-6">
            <div className="flex flex-col">
              <span className="text-caption text-secondary">Best score</span>
              <span className="text-title1 tabular-nums">{best}%</span>
            </div>
            <div className="flex flex-col">
              <span className="text-caption text-secondary">Attempts</span>
              <span className="text-title1 tabular-nums">{attempts.length}</span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {resumable ? (
            <>
              <Button onClick={() => start(false)}>
                <Play aria-hidden className="size-[18px]" />
                Resume · {answeredCount(resumable)} of {resumable.questionIds.length} answered
              </Button>
              <Button variant="secondary" onClick={() => start(true)}>
                <RotateCcw aria-hidden className="size-[18px]" />
                Start over
              </Button>
            </>
          ) : (
            <Button onClick={() => start(true)}>
              <Play aria-hidden className="size-[18px]" />
              {attempts.length > 0 ? "Take it again" : "Start quiz"}
            </Button>
          )}
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-title2">Attempt history</h2>
        {attempts.length === 0 ? (
          <EmptyState
            icon={<History className="size-6" />}
            title="No attempts yet"
            description="Take the quiz and your score, timing and a full review will show up here."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {attempts.map((attempt) => (
              <li key={attempt.id}>
                <Link href={`/attempts/${attempt.id}`} className="block rounded-xl outline-offset-2">
                  <Card interactive className="flex items-center justify-between gap-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-callout font-medium tabular-nums">
                        {attempt.score}%
                      </span>
                      <span className="text-caption text-secondary">
                        {attempt.completedAt?.toDate?.().toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        }) ?? "Just now"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-caption text-tertiary">
                        {attempt.answers.length} questions
                        {attempt.durationSec !== undefined &&
                          ` · ${formatDuration(attempt.durationSec)}`}
                      </span>
                      <Menu label={`Actions for the ${attempt.score}% attempt`}>
                        {(close) => (
                          <MenuItem
                            destructive
                            icon={<Trash2 aria-hidden className="size-4" />}
                            onClick={() => {
                              close();
                              setRemoving(attempt);
                            }}
                          >
                            Delete attempt
                          </MenuItem>
                        )}
                      </Menu>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {removing && (
        <ConfirmDialog
          open
          onClose={() => setRemoving(null)}
          onConfirm={onDeleteAttempt}
          busy={busy}
          title={`Delete this ${removing.score}% attempt?`}
          description="It disappears from your history along with its review. The quiz itself is untouched."
        />
      )}
    </div>
  );
}
