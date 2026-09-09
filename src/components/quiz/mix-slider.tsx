"use client";

import { useId } from "react";
import { MCQ_PCT_STEP, resolveCounts } from "@/lib/generation/settings";
import { cn } from "@/lib/utils";

/**
 * §2.2's MCQ/identification mix. A native range input so keyboard and screen
 * reader behaviour come for free; only the track and thumb are restyled.
 */
export function MixSlider({
  value,
  onChange,
  questionCount,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  questionCount: number;
  className?: string;
}) {
  const id = useId();
  const { mcq, identification } = resolveCounts(questionCount, value);
  const summary = `${mcq} multiple choice, ${identification} identification`;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-caption font-medium text-secondary">
          Question mix
        </label>
        <span className="text-caption text-tertiary tabular-nums">{value}% multiple choice</span>
      </div>

      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={MCQ_PCT_STEP}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-valuetext={summary}
        // The filled portion is painted with a gradient stop at the current value.
        style={{
          background: `linear-gradient(to right, var(--color-accent) ${value}%, var(--color-surface-secondary) ${value}%)`,
        }}
        className={cn(
          "h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none",
          "[&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none",
          "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white",
          "[&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgb(0_0_0/0.3)]",
          "[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:border-0",
          "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white",
          "[&::-moz-range-thumb]:shadow-[0_1px_4px_rgb(0_0_0/0.3)]",
          // §7.3: focus rings are never removed.
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]",
        )}
      />

      <p className="text-caption text-tertiary" aria-live="polite">
        {mcq} multiple choice · {identification} identification
      </p>
    </div>
  );
}
