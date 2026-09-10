"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { Sidebar } from "@/components/shell/sidebar";
import { BottomTabBar } from "@/components/shell/bottom-tab-bar";
import { NetworkToast } from "@/components/shell/network-toast";
import { TopBar } from "@/components/shell/top-bar";
import { usePersistedValue } from "@/lib/persisted-state";

const SIDEBAR_STORAGE_KEY = "reviewhere.sidebarCollapsed";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = usePersistedValue<"true" | "false">(SIDEBAR_STORAGE_KEY, "false");
  const collapsed = stored === "true";

  return (
    <div className="flex min-h-dvh">
      {/* §6: keyboard users shouldn't have to tab the whole nav on every page. */}
      <a
        href="#main"
        className="sr-only rounded-md bg-surface px-4 py-2 text-callout font-medium shadow-[var(--shadow-overlay)] focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-accent)]"
      >
        Skip to content
      </a>
      <NetworkToast />
      <Sidebar collapsed={collapsed} onToggle={() => setStored(collapsed ? "false" : "true")} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {/* Bottom padding clears the mobile tab bar. */}
        <main id="main" className="page flex-1 pt-6 pb-28 sm:pt-10 lg:pb-20">
          <AuthGuard>{children}</AuthGuard>
        </main>
      </div>
      <BottomTabBar />
    </div>
  );
}
