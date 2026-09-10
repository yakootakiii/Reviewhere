"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Plain-language message rendered inline and wired up via aria-describedby. */
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, error, hint, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = [error ? errorId : null, hint && !error ? hintId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-caption text-secondary">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          // A single hairline and a generous target — no inner shadow, no fill.
          "h-11 w-full rounded-md bg-surface px-3.5 text-callout text-primary",
          "border border-[var(--color-border)] placeholder:text-tertiary",
          "transition-colors duration-150 outline-none",
          "hover:border-[var(--color-border-strong)]",
          "focus-visible:border-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]",
          "disabled:opacity-50",
          error && "border-[var(--color-error)]",
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-[var(--color-error)]">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-caption text-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
