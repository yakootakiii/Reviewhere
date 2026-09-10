"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";

/** §7.4: translucent/blurred on scroll, with a ⌘K search hint. */
export function TopBar() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center gap-3 px-5 transition-colors duration-200 sm:px-8",
        scrolled
          ? "surface-blur border-b border-[var(--color-border)]"
          : "border-b border-transparent bg-[var(--color-bg)]",
      )}
    >
      <Link href="/dashboard" className="text-callout font-semibold tracking-[-0.01em] lg:hidden">
        Reviewhere<span className="text-[var(--color-accent)]">.</span>
      </Link>

      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          // The library owns the results; the URL carries the query so ⌘K from
          // any page lands there already filtered.
          router.push(query.trim() ? `/library?q=${encodeURIComponent(query.trim())}` : "/library");
        }}
        className="relative ml-auto hidden max-w-sm flex-1 items-center sm:flex lg:ml-0"
      >
        <Search aria-hidden className="pointer-events-none absolute left-3 size-4 text-tertiary" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search reviewers"
          aria-label="Search reviewers"
          className={cn(
            "h-9 w-full rounded-md bg-surface-secondary pr-14 pl-9 text-callout text-primary",
            "placeholder:text-tertiary outline-none transition-colors duration-150",
            "hover:bg-surface-hover",
            "focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]",
          )}
        />
        <kbd
          aria-hidden
          className="absolute right-2.5 text-[11px] text-tertiary"
        >
          ⌘K
        </kbd>
      </form>

      <div className="ml-auto flex items-center gap-1 lg:ml-4">
        <UserMenu />
      </div>
    </header>
  );
}
