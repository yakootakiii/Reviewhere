"use client";

import Link from "next/link";
import { FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
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
            Upload a document to generate your first reviewer.
          </p>
        </div>
        <Link href="/create">
          <Button>
            <Plus aria-hidden className="size-[18px]" />
            New Reviewer
          </Button>
        </Link>
      </div>

      {/* M2–M5 replace this with the real document/quiz grid. */}
      <EmptyState
        icon={<FolderOpen className="size-6" />}
        title="No reviewers yet"
        description="Upload a PDF or PowerPoint and Reviewhere will turn it into a quiz you can take right away."
        action={
          <Link href="/create">
            <Button>Upload your first document</Button>
          </Link>
        }
      />
    </div>
  );
}
