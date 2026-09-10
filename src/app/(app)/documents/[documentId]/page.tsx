"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Presentation, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardSkeleton, EmptyState, ErrorPanel } from "@/components/ui/feedback";
import { useAuth } from "@/components/auth/auth-provider";
import { GenerateFlow } from "@/components/quiz/generate-flow";
import { LibraryCard } from "@/components/library/library-card";
import { buildLibraryItems } from "@/lib/library";
import { getDocument } from "@/lib/firebase/documents";
import { listQuizzesForDocument } from "@/lib/firebase/quizzes";
import type { Quiz, StudyDocument } from "@/lib/types";

type State =
  | { name: "loading" }
  | { name: "missing" }
  | { name: "error" }
  | { name: "ready"; document: StudyDocument; quizzes: Quiz[] };

/**
 * The per-document hub §2.6 implies: what was uploaded, the quizzes made from
 * it, and the way to make another. A failed generation leaves the document
 * here untouched, with the action still available.
 */
export default function DocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
  // Next 16 hands route params to client components as a promise.
  const { documentId } = use(params);
  const { user } = useAuth();
  const [state, setState] = useState<State>({ name: "loading" });

  useEffect(() => {
    if (!user) return;
    let active = true;

    Promise.all([getDocument(documentId), listQuizzesForDocument(user.uid, documentId)])
      .then(([document, quizzes]) => {
        if (!active) return;
        if (!document || document.ownerId !== user.uid) setState({ name: "missing" });
        else setState({ name: "ready", document, quizzes });
      })
      .catch(() => {
        if (active) setState({ name: "error" });
      });

    return () => {
      active = false;
    };
  }, [user, documentId]);

  if (state.name === "loading") {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 py-4" aria-busy="true">
        <CardSkeleton />
      </div>
    );
  }

  if (state.name === "missing" || state.name === "error") {
    return (
      <div className="mx-auto max-w-4xl py-4">
        <ErrorPanel
          title={state.name === "missing" ? "We couldn't find that document" : "Something went wrong"}
          description={
            state.name === "missing"
              ? "It may have been deleted, or it belongs to another account."
              : "Check your connection and try again."
          }
          action={
            <Link href="/library">
              <Button variant="secondary">Back to library</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const { document, quizzes } = state;
  const Icon = document.fileType === "pptx" ? Presentation : FileText;
  const unit = document.fileType === "pptx" ? "slides" : "pages";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-14">
      <div className="flex flex-col gap-5">
        <Link
          href="/library"
          className="inline-flex w-fit items-center gap-1.5 rounded-md text-caption text-secondary hover:text-primary"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Library
        </Link>

        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-caption text-tertiary">
            <Icon aria-hidden strokeWidth={1.75} className="size-4" />
            {document.pageCount} {unit} · {quizzes.length} quiz
            {quizzes.length === 1 ? "" : "zes"}
          </p>
          <h1 className="text-display break-words">{document.fileName}</h1>
        </div>
      </div>

      <GenerateFlow
        document={document}
        label={quizzes.length > 0 ? "Generate another quiz" : "Generate quiz"}
      />

      <section className="flex flex-col gap-5">
        <h2 className="text-caption tracking-[0.06em] text-tertiary uppercase">Quizzes</h2>
        {quizzes.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="size-6" />}
            title="No quizzes from this document yet"
            description="Generate one automatically, or use the copy-paste prompt with any LLM you already have open."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {buildLibraryItems([], quizzes).map((item) => (
              <LibraryCard key={item.id} item={item} view="grid" />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
