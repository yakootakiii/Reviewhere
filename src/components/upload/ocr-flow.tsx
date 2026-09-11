"use client";

import { useCallback, useRef, useState } from "react";
import { ScanLine, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ui/feedback";
import { useAuth } from "@/components/auth/auth-provider";
import { runOcr, OcrError } from "@/lib/firebase/documents";
import type { OcrEvent } from "@/lib/ocr/types";
import { cn } from "@/lib/utils";

export interface OcrOutcome {
  pages: number[];
  skipped: number[];
  characters: number;
}

type Stage =
  | { name: "offer" }
  | { name: "reading"; message: string; completed: number; total: number }
  | { name: "error"; message: string };

/**
 * The opt-in and progress for reading a scan (§3.3).
 *
 * Deliberately opt-in rather than automatic: it is one model call per page
 * against a quota the five of us share, it takes minutes rather than seconds,
 * and handwriting accuracy varies enough that you should know it happened. So
 * the offer states the page count and a rough time before spending anything.
 */
export function OcrFlow({
  documentId,
  file,
  pageCount,
  onDone,
}: {
  documentId: string;
  /** The original PDF — the server keeps no copy, so the browser's is the only one. */
  file: File;
  pageCount: number;
  onDone: (outcome: OcrOutcome) => void;
}) {
  const { user } = useAuth();
  const [stage, setStage] = useState<Stage>({ name: "offer" });
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    if (!user) return;
    setStage({ name: "reading", message: "Starting…", completed: 0, total: pageCount });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let outcome: OcrOutcome | null = null;
      let failure: string | null = null;

      await runOcr(
        user,
        documentId,
        file,
        (event: OcrEvent) => {
          if (event.type === "progress") {
            setStage({
              name: "reading",
              message: event.message,
              completed: event.completed,
              total: event.total,
            });
          } else if (event.type === "notice") {
            setStage((current) =>
              current.name === "reading" ? { ...current, message: event.message } : current,
            );
          } else if (event.type === "done") {
            outcome = {
              pages: event.pages,
              skipped: event.skipped,
              characters: event.characters,
            };
          } else {
            failure = event.message;
          }
        },
        controller.signal,
      );

      if (outcome) onDone(outcome);
      else setStage({ name: "error", message: failure ?? "We couldn't read that file." });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStage({ name: "offer" });
        return;
      }
      setStage({
        name: "error",
        message:
          error instanceof OcrError || error instanceof Error
            ? error.message
            : "We couldn't read that file.",
      });
    } finally {
      abortRef.current = null;
    }
  }, [user, documentId, file, pageCount, onDone]);

  if (stage.name === "error") {
    return (
      <ErrorPanel
        title="We couldn't read the handwriting"
        description={stage.message}
        action={
          <Button variant="secondary" onClick={() => setStage({ name: "offer" })}>
            Back
          </Button>
        }
      />
    );
  }

  if (stage.name === "offer") {
    return (
      <div className="flex flex-col items-start gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="flex items-center gap-2.5 text-title2">
            <ScanLine aria-hidden strokeWidth={1.75} className="size-5 text-tertiary" />
            This looks like scanned notes
          </h2>
          <p className="max-w-[56ch] text-callout text-secondary">
            There&rsquo;s no selectable text in this PDF, so we can read the handwriting instead.
            That&rsquo;s {pageCount} page{pageCount === 1 ? "" : "s"} — about{" "}
            {estimateMinutes(pageCount)}. You&rsquo;ll be able to check and fix the transcription
            before any questions are written from it.
          </p>
        </div>
        <Button onClick={start}>Read the handwriting</Button>
      </div>
    );
  }

  const percent = stage.total > 0 ? Math.round((stage.completed / stage.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <ScanLine aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-tertiary" />
        <p className="min-w-0 flex-1 truncate text-callout font-medium">Reading handwriting</p>
        <IconButton label="Stop reading" onClick={() => abortRef.current?.abort()}>
          <X aria-hidden className="size-[18px]" />
        </IconButton>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Reading progress"
        className="h-[3px] overflow-hidden rounded-full bg-[var(--color-border)]"
      >
        <div
          className={cn("h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-300")}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* §7.7: say what is actually happening rather than inventing a number. */}
      <p className="text-caption text-secondary">{stage.message}</p>
    </div>
  );
}

/** Roughly three seconds a page, rounded to something a person would say. */
function estimateMinutes(pages: number): string {
  const seconds = pages * 3;
  if (seconds < 45) return "half a minute";
  const minutes = Math.round(seconds / 60);
  return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}
