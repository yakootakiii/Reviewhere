"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { SetupNotice } from "./setup-notice";
import { Skeleton } from "@/components/ui/feedback";

/**
 * Client-side route guard. This is a UX gate, not a security boundary — the
 * real enforcement is Firestore/Storage rules scoped to the owning uid (§3).
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, configured } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (configured && !loading && !user) router.replace("/sign-in");
  }, [configured, loading, user, router]);

  if (!configured) return <SetupNotice />;

  if (loading || !user) {
    return (
      <div className="flex flex-col gap-4 p-6" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-4 w-72" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
