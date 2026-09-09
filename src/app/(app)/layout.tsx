"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { Sidebar } from "@/components/shell/sidebar";
import { BottomTabBar } from "@/components/shell/bottom-tab-bar";
import { TopBar } from "@/components/shell/top-bar";
import { usePersistedValue } from "@/lib/persisted-state";

const SIDEBAR_STORAGE_KEY = "reviewhere.sidebarCollapsed";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = usePersistedValue<"true" | "false">(SIDEBAR_STORAGE_KEY, "false");
  const collapsed = stored === "true";

  return (
    <div className="flex min-h-dvh">
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
