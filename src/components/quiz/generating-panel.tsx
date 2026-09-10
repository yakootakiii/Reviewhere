"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ui/feedback";
import { useAuth } from "@/components/auth/auth-provider";
import { generateQuiz, ModeAError } from "@/lib/firebase/quizzes";
import type { QuizSettings } from "@/lib/generation/types";
import type { QuizSource } from "@/lib/quiz-shared";

/**
 * Mode A progress. The route streams what it is actually doing, so this shows
 * chunk-by-chunk copy and a bar tied to real completed work — §7.7 asks for
 * honest loading states, not a fabricated countdown.
 */
export function GeneratingPanel({
  document,
  settings,
  onDone,
  onUsePrompt,
  onCancel,
}: {
  document: QuizSource;
  settings: QuizSettings;
  onDone: (result: { quizId: string; questionCount: number; requested: number }) => void;
  onUsePrompt: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const [message, setMessage] = useState("Reading your document…");
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [failure, setFailure] = useState<{ message: string; offerModeB: boolean } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    let active = true;

    generateQuiz(
      user,
      document.id,
      settings,
      (event) => {
        if (!active) return;
        if (event.type === "progress") {
          setMessage(event.message);
          setProgress({ completed: event.completed, total: event.total });
        } else if (event.type === "notice") {
          setNotice(event.message);
        } else if (event.type === "done") {
          onDone(event);
        } else if (event.type === "error") {
          setFailure({ message: event.message, offerModeB: event.offerModeB });
        }
      },
      controller.signal,
    ).catch((error: unknown) => {
      if (!active || controller.signal.aborted) return;
      setFailure({
        message:
          error instanceof ModeAError
            ? error.message
            : "Generation stopped unexpectedly. Your document is safe in the library.",
        offerModeB: error instanceof ModeAError ? error.offerModeB : true,
      });
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [user, document.id, settings, onDone]);

  if (failure) {
    return (
      <ErrorPanel
        title="We couldn't generate that quiz"
        description={failure.message}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={onCancel}>
              Back to settings
            </Button>
            {failure.offerModeB && <Button onClick={onUsePrompt}>Use a copy-paste prompt</Button>}
          </div>
        }
      />
    );
  }

  const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="min-w-0">
        <p className="text-callout font-medium">Writing your quiz</p>
        <p className="truncate text-caption text-tertiary">{document.fileName}</p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.total > 0 ? percent : undefined}
        aria-label="Generation progress"
        className="h-[3px] overflow-hidden rounded-full bg-[var(--color-border)]"
      >
        <div
          className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-500"
          // Until the server reports a chunk count there is nothing honest to
          // show, so the bar animates instead of inventing a percentage.
          style={progress.total > 0 ? { width: `${Math.max(percent, 6)}%` } : { width: "18%" }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-caption text-secondary" aria-live="polite">
          {message}
        </p>
        {notice && <p className="text-caption text-[var(--color-warning)]">{notice}</p>}
      </div>

      <div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
