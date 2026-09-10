"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/button";
import { NAV_ITEMS } from "./nav-items";

/** Desktop sidebar (§7.6, ≥1024px). Collapses to icon-only. */
export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-[var(--color-border)] px-3 py-5 lg:flex",
        "transition-[width] duration-200 [transition-timing-function:var(--ease-out-soft)]",
        collapsed ? "w-[68px]" : "w-[220px]",
      )}
    >
      <div className={cn("mb-8 flex items-center px-2", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <Link href="/dashboard" className="text-callout font-semibold tracking-[-0.01em]">
            Reviewhere<span className="text-[var(--color-accent)]">.</span>
          </Link>
        )}
        <IconButton label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={onToggle}>
          {collapsed ? (
            <PanelLeftOpen aria-hidden className="size-[18px]" />
          ) : (
            <PanelLeftClose aria-hidden className="size-[18px]" />
          )}
        </IconButton>
      </div>

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? label : undefined}
              // Active state is weight and colour, not a filled tint block —
              // a coloured pill per item makes the nav the loudest thing on screen.
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-callout",
                "transition-colors duration-150",
                collapsed && "justify-center px-0",
                active
                  ? "font-medium text-primary"
                  : "text-secondary hover:text-primary",
              )}
            >
              <Icon
                aria-hidden
                strokeWidth={active ? 2 : 1.75}
                className={cn("size-[18px] shrink-0", active && "text-[var(--color-accent)]")}
              />
              {!collapsed && label}
              {collapsed && <span className="sr-only">{label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
