"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

/**
 * The app's only navigation: a floating dock, fixed to the bottom on every
 * screen size. It replaces the desktop sidebar and the mobile tab bar, which
 * were two components rendering the same three links.
 *
 * The active item is marked by a single pill that *moves* between items rather
 * than one pill per item appearing and disappearing — `layoutId` hands the
 * animation to Motion, so it slides from wherever it was to wherever it needs
 * to be. It is a tween rather than a spring: the design language here doesn't
 * bounce, and this fires on every navigation.
 */
export function Dock() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed inset-x-0 z-40 flex justify-center px-3",
        // Sits above the home indicator on iOS, and clear of the edge elsewhere.
        "bottom-[max(0.75rem,env(safe-area-inset-bottom))]",
      )}
    >
      <ul
        className={cn(
          "surface-blur flex max-w-full items-center gap-0.5 rounded-full p-1.5 sm:gap-1",
          "border border-[var(--color-border)] shadow-[var(--shadow-overlay)]",
        )}
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // Tighter on the narrowest phones so three labelled items
                  // still fit a 320px screen without the dock clipping.
                  "relative flex items-center gap-1.5 rounded-full px-3 py-2 transition-colors duration-150 sm:gap-2 sm:px-4",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
                  active ? "text-primary" : "text-secondary hover:text-primary",
                )}
              >
                {active && (
                  <motion.span
                    aria-hidden
                    layoutId="dock-active"
                    className="absolute inset-0 rounded-full bg-surface-secondary"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
                    }
                  />
                )}
                {/* Above the sliding pill, which is painted behind the content. */}
                <span className="relative flex items-center gap-2">
                  <Icon
                    aria-hidden
                    strokeWidth={active ? 2 : 1.75}
                    className={cn("size-[18px] shrink-0", active && "text-[var(--color-accent)]")}
                  />
                  {/* Below 360px three labelled items would overflow the dock,
                      so the narrowest phones get a genuinely dock-like row of
                      icons. sr-only rather than hidden, so the link keeps its
                      accessible name either way. */}
                  <span className="text-caption font-medium max-[359px]:sr-only">{label}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
