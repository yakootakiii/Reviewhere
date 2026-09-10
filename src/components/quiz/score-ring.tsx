"use client";

import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** §7.4's circular completion ring. Plain SVG — no charting dependency. */
export function ScoreRing({
  score,
  size = 160,
  className,
}: {
  score: number;
  size?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * (Math.min(Math.max(score, 0), 100) / 100);

  // One colour, not a traffic light: the number already says how it went, and
  // grading the ring red turns a study tool into a scold.
  const tone = "var(--color-accent)";

  return (
    <div className={cn("relative inline-flex", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={stroke}
        />
        {/* A round line cap on a zero-length arc renders as a stray dot. */}
        {filled > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          // Start the arc at twelve o'clock rather than three.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={
            reduceMotion
              ? undefined
              : { transition: "stroke-dasharray 700ms var(--ease-out-soft)" }
          }
        />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[40px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
          {score}
          <span className="text-title2 text-tertiary">%</span>
        </span>
      </div>
    </div>
  );
}
