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
        className="sr-only rounded-md bg-surface px-4 py-2 text-callout font-medium shadow-[var(--shadow-lifted)] focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-accent)]"
      >
        Skip to content
      </a>
      <NetworkToast />
      <Sidebar collapsed={collapsed} onToggle={() => setStored(collapsed ? "false" : "true")} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {/* Bottom padding clears the mobile tab bar. */}
        <main id="main" className="flex-1 px-4 pt-2 pb-24 sm:px-6 lg:pb-10">
          <AuthGuard>{children}</AuthGuard>
        </main>
      </div>
      <BottomTabBar />
    </div>
  );
}
