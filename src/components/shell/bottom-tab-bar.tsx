"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

/** §7.6: below 768px the sidebar becomes a bottom tab bar. */
export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="surface-blur fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--color-border)] pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-colors duration-150",
              active ? "font-medium text-primary" : "text-secondary",
            )}
          >
            <Icon
              aria-hidden
              strokeWidth={active ? 2 : 1.75}
              className={cn("size-[21px]", active && "text-[var(--color-accent)]")}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
