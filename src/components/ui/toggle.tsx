"use client";

import { cn } from "@/lib/utils";

/** iOS-style pill switch (§7.4). */
export function Toggle({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-4 py-1",
        disabled ? "opacity-50" : "cursor-pointer",
      )}
    >
      <span className="flex flex-col">
        <span className="text-callout text-primary">{label}</span>
        {description && <span className="text-caption text-secondary">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-[var(--color-success)]" : "bg-[var(--color-surface-hover)]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-[0_2px_4px_rgb(0_0_0/0.2)]",
            "transition-transform duration-200 [transition-timing-function:var(--ease-out-soft)]",
            checked && "translate-x-5",
          )}
        />
      </button>
    </label>
  );
}
