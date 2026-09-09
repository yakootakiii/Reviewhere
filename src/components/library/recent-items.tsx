"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Library as LibraryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardSkeleton, EmptyState, ErrorPanel } from "@/components/ui/feedback";
import { useAuth } from "@/components/auth/auth-provider";
import { LibraryCard } from "./library-card";
import { listDocuments } from "@/lib/firebase/documents";
import { listQuizzes } from "@/lib/firebase/quizzes";
import { buildLibraryItems, sortItems } from "@/lib/library";
import type { Quiz, StudyDocument } from "@/lib/types";

type State =
  | { name: "loading" }
  | { name: "ready"; documents: StudyDocument[]; quizzes: Quiz[] }
  | { name: "error" };

/**
 * §2.6's dashboard grid: the most recent documents and quizzes together. Cards
 * are read-only here — managing things is the Library's job.
 */
export function RecentItems({ max = 6 }: { max?: number }) {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ name: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;

    Promise.all([listDocuments(user.uid, max), listQuizzes(user.uid, max)])
      .then(([documents, quizzes]) => {
        if (active) setState({ name: "ready", documents, quizzes });
      })
      .catch(() => {
        if (active) setState({ name: "error" });
      });

    return () => {
      active = false;
    };
  }, [user, max, reloadKey]);

  const items = useMemo(
    () =>
      state.name === "ready"
        ? sortItems(buildLibraryItems(state.documents, state.quizzes), "recent").slice(0, max)
        : [],
    [state, max],
  );

  if (state.name === "loading") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (state.name === "error") {
    return (
      <ErrorPanel
        title="We couldn't load your library"
        description="Check your connection and try again."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setState({ name: "loading" });
              setReloadKey((key) => key + 1);
            }}
          >
            Try again
          </Button>
        }
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<LibraryIcon className="size-6" />}
        title="No reviewers yet"
        description="Upload a PDF or PowerPoint and Reviewhere will turn it into a quiz you can take right away."
        action={
          <Link href="/create">
            <Button>Upload your first document</Button>
          </Link>
        }
      />
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`}>
          <LibraryCard item={item} view="grid" />
        </li>
      ))}
    </ul>
  );
}
