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
        "sticky top-0 hidden h-dvh shrink-0 flex-col gap-1 border-r border-[var(--color-border)] px-3 py-4 lg:flex",
        "transition-[width] duration-300 [transition-timing-function:var(--ease-out-soft)]",
        collapsed ? "w-[76px]" : "w-[240px]",
      )}
    >
      <div className={cn("mb-4 flex items-center px-2", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <Link href="/dashboard" className="text-title2 tracking-tight">
            Review<span className="text-accent-gradient">here</span>
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

      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-callout font-medium",
                "transition-colors duration-200",
                collapsed && "justify-center px-0",
                active
                  ? "bg-accent-soft text-[var(--color-accent)]"
                  : "text-secondary hover:bg-surface-secondary hover:text-primary",
              )}
            >
              <Icon aria-hidden className="size-[18px] shrink-0" />
              {!collapsed && label}
              {collapsed && <span className="sr-only">{label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
