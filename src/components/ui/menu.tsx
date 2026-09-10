"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * §7.4's dropdown, extracted from the pattern proven in
 * `src/components/shell/user-menu.tsx` (outside-click, Escape, aria-haspopup)
 * so the card action menus don't reimplement it a third time.
 */
export function Menu({
  label = "More actions",
  align = "end",
  children,
  trigger,
}: {
  label?: string;
  align?: "start" | "end";
  children: (close: () => void) => React.ReactNode;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={(event) => {
          // Cards are links; the menu button must not navigate.
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-tertiary",
          "transition-colors duration-150 [transition-timing-function:var(--ease-out-soft)]",
          "hover:bg-surface-secondary hover:text-primary",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
          open && "bg-surface-secondary text-primary",
        )}
      >
        {trigger ?? <MoreHorizontal aria-hidden className="size-[18px]" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.08 : 0.12, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "absolute z-40 mt-1.5 flex min-w-44 flex-col rounded-md bg-surface p-1",
              "hairline shadow-[var(--shadow-overlay)]",
              align === "end" ? "right-0" : "left-0",
            )}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MenuItem({
  onClick,
  icon,
  children,
  destructive,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-callout",
        "transition-colors duration-100 hover:bg-surface-secondary",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]",
        destructive ? "text-[var(--color-error)]" : "text-primary",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
