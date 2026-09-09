"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentGrid } from "@/components/library/document-grid";
import { useAuth } from "@/components/auth/auth-provider";

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const firstName = (profile?.displayName ?? user?.displayName ?? "").split(" ")[0];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 py-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-display">{firstName ? `Hi, ${firstName}` : "My Reviewers"}</h1>
          <p className="text-callout text-secondary">
            Pick up a reviewer, or upload something new.
          </p>
        </div>
        <Link href="/create">
          <Button>
            <Plus aria-hidden className="size-[18px]" />
            New Reviewer
          </Button>
        </Link>
      </div>

      <DocumentGrid max={6} />
    </div>
  );
}
