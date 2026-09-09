"use client";

import { CheckCircle2, Eye, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Question } from "@/lib/types";

/**
 * Immediate-mode feedback (§2.4). For identification it also carries the §2.3
 * fallback: after two wrong tries the answer can be revealed. Only the first
 * submission is scored, so retrying is for learning, not for points.
 */
export function AnswerFeedback({
  question,
  correct,
  revealed,
  wrongTries,
  onReveal,
  onRetry,
}: {
  question: Question;
  correct: boolean;
  revealed: boolean;
  wrongTries: number;
  onReveal: () => void;
  onRetry: () => void;
}) {
  const canRetry = !correct && question.type === "identification" && !revealed;
  const showAnswer = correct || revealed || question.type === "mcq";

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-xl p-4",
        correct ? "bg-[var(--color-success-soft)]" : "bg-[var(--color-error-soft)]",
      )}
    >
      <div className="flex items-center gap-2">
        {correct ? (
          <CheckCircle2 aria-hidden className="size-5 text-[var(--color-success)]" />
        ) : (
          <XCircle aria-hidden className="size-5 text-[var(--color-error)]" />
        )}
        <p className="text-callout font-medium">{correct ? "Correct" : "Not quite"}</p>
      </div>

      {showAnswer && (
        <p className="text-callout">
          <span className="text-secondary">Answer: </span>
          {question.correctAnswer}
        </p>
      )}

      {showAnswer && <p className="text-caption text-secondary">{question.explanation}</p>}

      {question.sourcePage !== null && showAnswer && (
        <p className="text-caption text-tertiary">From page {question.sourcePage}</p>
      )}

      {canRetry && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
          {/* §2.3: the way out after two misses. */}
          {wrongTries >= 2 && (
            <Button variant="ghost" size="sm" onClick={onReveal}>
              <Eye aria-hidden className="size-[18px]" />
              Reveal answer
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
