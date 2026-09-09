"use client";

import { cn } from "@/lib/utils";
import type { Question } from "@/lib/types";

/**
 * One question (§2.4: one per screen on mobile, a card on desktop).
 *
 * The 1–4 shortcuts are handled by the runner at the window level, but they are
 * shown here so the affordance is visible rather than folklore.
 */
export function QuestionCard({
  question,
  index,
  total,
  selected,
  onSelect,
  textAnswer,
  onTextChange,
  onSubmit,
  locked,
  inputRef,
}: {
  question: Question;
  index: number;
  total: number;
  selected: string | null;
  onSelect: (choice: string) => void;
  textAnswer: string;
  onTextChange: (value: string) => void;
  onSubmit: () => void;
  locked: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-xl bg-surface hairline p-6 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-2">
        <p className="text-caption text-tertiary">
          Question {index + 1} of {total} ·{" "}
          {question.type === "mcq" ? "Multiple choice" : "Identification"}
        </p>
        <h2 className="text-title2 leading-snug">{question.prompt}</h2>
      </div>

      {question.type === "mcq" && question.choices ? (
        <ul className="flex flex-col gap-2">
          {question.choices.map((choice, choiceIndex) => {
            const isSelected = selected === choice;
            return (
              <li key={choice}>
                <button
                  type="button"
                  disabled={locked}
                  aria-pressed={isSelected}
                  onClick={() => onSelect(choice)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-4 py-3 text-left text-callout",
                    "transition-all duration-200 [transition-timing-function:var(--ease-out-soft)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
                    "disabled:cursor-default",
                    isSelected
                      ? "bg-accent-soft ring-2 ring-[var(--color-accent)]"
                      : "bg-surface-secondary hover:bg-surface-hover",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-[7px] text-caption font-medium",
                      isSelected
                        ? "bg-[var(--color-accent)] text-white"
                        : "bg-surface text-tertiary",
                    )}
                  >
                    {choiceIndex + 1}
                  </span>
                  {choice}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="identification-answer" className="text-caption font-medium text-secondary">
            Your answer
          </label>
          <input
            id="identification-answer"
            ref={inputRef}
            value={textAnswer}
            disabled={locked}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(event) => onTextChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Type your answer"
            className={cn(
              "h-12 w-full rounded-md bg-surface px-3.5 text-body text-primary",
              "border border-[var(--color-border-strong)] placeholder:text-tertiary",
              "outline-none transition-colors duration-200",
              "focus-visible:border-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]",
              "disabled:opacity-60",
            )}
          />
          <p className="text-caption text-tertiary">
            Small spelling slips are fine — press Enter to submit.
          </p>
        </div>
      )}
    </div>
  );
}
