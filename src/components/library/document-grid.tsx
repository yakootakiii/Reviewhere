"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Library as LibraryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardSkeleton, EmptyState, ErrorPanel } from "@/components/ui/feedback";
import { useAuth } from "@/components/auth/auth-provider";
import { listDocuments } from "@/lib/firebase/documents";
import type { StudyDocument } from "@/lib/types";
import { DocumentCard } from "./document-card";

type State =
  | { name: "loading" }
  | { name: "ready"; documents: StudyDocument[] }
  | { name: "error" };

export function DocumentGrid({ max }: { max?: number }) {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ name: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;

    listDocuments(user.uid, max)
      .then((documents) => {
        if (active) setState({ name: "ready", documents });
      })
      .catch(() => {
        if (active) setState({ name: "error" });
      });

    return () => {
      active = false;
    };
  }, [user, max, reloadKey]);

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

  if (state.documents.length === 0) {
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
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {state.documents.map((document) => (
        <DocumentCard key={document.id} document={document} />
      ))}
    </div>
  );
}
