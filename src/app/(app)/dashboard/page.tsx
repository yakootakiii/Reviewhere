"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecentItems } from "@/components/library/recent-items";
import { useAuth } from "@/components/auth/auth-provider";

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const firstName = (profile?.displayName ?? user?.displayName ?? "").split(" ")[0];

  return (
    <div className="mx-auto flex max-w-5xl flex-col">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-display">{firstName ? `Hi, ${firstName}` : "My reviewers"}</h1>
          <p className="text-callout text-secondary">
            Pick up where you left off, or start something new.
          </p>
        </div>
        <Link href="/create">
          <Button>
            <Plus aria-hidden className="size-4" />
            New reviewer
          </Button>
        </Link>
      </header>

      <div className="mt-12">
        <h2 className="mb-5 text-caption tracking-[0.06em] text-tertiary uppercase">Recent</h2>
        <RecentItems max={8} />
      </div>
    </div>
  );
}
