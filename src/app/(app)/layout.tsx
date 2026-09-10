"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { Dock } from "@/components/shell/dock";
import { NetworkToast } from "@/components/shell/network-toast";
import { TopBar } from "@/components/shell/top-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* §6: keyboard users shouldn't have to tab the whole nav on every page. */}
      <a
        href="#main"
        className="sr-only rounded-md bg-surface px-4 py-2 text-callout font-medium shadow-[var(--shadow-overlay)] focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-accent)]"
      >
        Skip to content
      </a>
      <NetworkToast />
      <TopBar />
      {/* Bottom padding clears the floating dock at every size. */}
      <main id="main" className="page flex-1 pt-6 pb-32 sm:pt-10">
        <AuthGuard>{children}</AuthGuard>
      </main>
      <Dock />
    </div>
  );
}
