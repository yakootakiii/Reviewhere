"use client";

import { cn } from "@/lib/utils";

/** §7.4 step indicator: one segment per question, filled as they're answered. */
export function ProgressSteps({
  total,
  current,
  answered,
}: {
  total: number;
  current: number;
  answered: Set<number>;
}) {
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      aria-label={`Question ${current + 1} of ${total}`}
      className="flex items-center gap-1"
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          aria-hidden
          className={cn(
            "h-[3px] flex-1 rounded-full transition-colors duration-200",
            index === current
              ? "bg-[var(--color-accent)]"
              : answered.has(index)
                ? "bg-[var(--color-border-strong)]"
                : "bg-[var(--color-border)]",
          )}
        />
      ))}
    </div>
  );
}
