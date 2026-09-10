"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEMES, type Theme, type ThemePreference } from "@/lib/themes";

/**
 * A theme in miniature: three stripes for page, well and accent. Dots on a
 * transparent background failed here — a dark theme's own colours vanish
 * against a dark page — so the swatch paints all three itself and carries a
 * border, which keeps a white-ish theme visible on a white page too.
 */
function Swatch({ colours, className }: { colours: readonly string[]; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 overflow-hidden rounded-md border border-[var(--color-border-strong)]",
        className,
      )}
    >
      {colours.map((colour, index) => (
        <span key={index} className="flex-1" style={{ backgroundColor: colour }} />
      ))}
    </span>
  );
}

const SYSTEM_SWATCH = ["#ffffff", "#8e8e93", "#0b0b0c"] as const;

/**
 * A dropdown rather than a segmented control: the list is long enough now that
 * laying every option out side by side would crowd the row, and a swatch shows
 * far more about a theme than its name does.
 */
export function ThemePicker({
  preference,
  active,
  onChange,
}: {
  preference: ThemePreference;
  /** The theme actually in effect — what "System" resolved to. */
  active: Theme;
  onChange: (preference: ThemePreference) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const isSystem = preference === "system";
  const label = isSystem ? `System · ${active.label}` : active.label;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Theme: ${label}`}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-11 w-full items-center gap-2.5 rounded-md border border-[var(--color-border)] px-3",
          "text-callout transition-colors duration-150 sm:w-56",
          "hover:border-[var(--color-border-strong)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
        )}
      >
        <Swatch colours={isSystem ? SYSTEM_SWATCH : active.swatch} />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-tertiary transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label="Theme"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.08 : 0.14, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "absolute right-0 z-50 mt-1.5 max-h-80 w-[min(20rem,calc(100vw-2.5rem))] overflow-y-auto",
              "rounded-md bg-surface p-1 hairline shadow-[var(--shadow-overlay)]",
            )}
          >
            <Option
              selected={isSystem}
              swatch={SYSTEM_SWATCH}
              label="System"
              description="Follows your device appearance"
              icon={<Monitor aria-hidden className="size-3.5 text-tertiary" />}
              onSelect={() => {
                onChange("system");
                setOpen(false);
              }}
            />
            <div className="my-1 h-px bg-[var(--color-border)]" />
            {THEMES.map((theme) => (
              <Option
                key={theme.id}
                selected={preference === theme.id}
                swatch={theme.swatch}
                label={theme.label}
                description={theme.description}
                onSelect={() => {
                  onChange(theme.id);
                  setOpen(false);
                }}
              />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function Option({
  selected,
  swatch,
  label,
  description,
  icon,
  onSelect,
}: {
  selected: boolean;
  swatch: readonly string[];
  label: string;
  description: string;
  icon?: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-3 rounded-sm px-2.5 py-2 text-left transition-colors duration-100",
          "hover:bg-surface-secondary",
          "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]",
        )}
      >
        <Swatch colours={swatch} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-callout">
            {label}
            {icon}
          </span>
          <span className="block truncate text-caption text-tertiary">{description}</span>
        </span>
        {selected && (
          <Check aria-hidden className="size-4 shrink-0 text-[var(--color-accent)]" />
        )}
      </button>
    </li>
  );
}
