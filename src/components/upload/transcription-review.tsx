"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorPanel, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/auth-provider";
import { getDocumentPages, savePageText } from "@/lib/firebase/documents";
import type { ExtractedPage } from "@/lib/extraction/types";
import { cn } from "@/lib/utils";

type State =
  | { name: "loading" }
  | { name: "error" }
  | { name: "ready"; pages: ExtractedPage[] };

/**
 * What the model read, page by page, before any questions come from it.
 *
 * This matters more here than anywhere else in the app. A misread word doesn't
 * produce a visibly broken quiz — it produces a confidently wrong question, and
 * a student revising from it has no way to tell. Surfacing the transcription
 * and letting it be fixed is the same principle Mode B's bad-row preview
 * follows: show what went wrong, let it be corrected, never silently drop it.
 *
 * It is a check, not a gate. Skipping straight to generating is one click.
 */
export function TranscriptionReview({
  documentId,
  onContinue,
}: {
  documentId: string;
  onContinue: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<State>({ name: "loading" });
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getDocumentPages(documentId)
      .then((pages) => {
        if (!active) return;
        setState({ name: "ready", pages: pages.filter((page) => page.text.trim() !== "") });
      })
      .catch(() => {
        if (active) setState({ name: "error" });
      });
    return () => {
      active = false;
    };
  }, [documentId]);

  const save = useCallback(
    async (page: number) => {
      if (!user) return;
      setSaving(true);
      try {
        await savePageText(user, documentId, page, draft);
        setState((current) =>
          current.name === "ready"
            ? {
                ...current,
                pages: current.pages.map((item) =>
                  item.page === page ? { ...item, text: draft } : item,
                ),
              }
            : current,
        );
        setEditing(null);
        toast(`Page ${page} saved.`, "success");
      } catch (error) {
        toast(error instanceof Error ? error.message : "We couldn't save that edit.", "error");
      } finally {
        setSaving(false);
      }
    },
    [user, documentId, draft, toast],
  );

  if (state.name === "loading") {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (state.name === "error") {
    return (
      <ErrorPanel
        title="We couldn't load the transcription"
        description="The text was saved — reload the page to see it."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-title2">Check what we read</h2>
        <p className="max-w-[56ch] text-callout text-secondary">
          Handwriting is read by a model, so a word here and there may be wrong. Anything you fix
          now is what the questions get written from. <code className="text-caption">[?]</code>{" "}
          marks a word it couldn&rsquo;t make out.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-[var(--color-border)]">
        {state.pages.map((page) => {
          const isEditing = editing === page.page;
          return (
            <li key={page.page} className="flex flex-col gap-2.5 py-5">
              <div className="flex items-center gap-3">
                <span className="text-caption text-tertiary">Page {page.page}</span>
                <span className="flex-1" />
                {isEditing ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(null)}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => void save(page.page)} disabled={saving}>
                      <Check aria-hidden className="size-4" />
                      Save
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(page.page);
                      setDraft(page.text);
                    }}
                  >
                    <Pencil aria-hidden className="size-4" />
                    Edit
                  </Button>
                )}
              </div>

              {isEditing ? (
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={Math.min(20, Math.max(4, draft.split("\n").length + 1))}
                  aria-label={`Transcription of page ${page.page}`}
                  className={cn(
                    "w-full rounded-md bg-surface p-3.5 font-mono text-callout text-primary",
                    "border border-[var(--color-border)] outline-none",
                    "focus-visible:border-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]",
                  )}
                />
              ) : (
                <p className="text-callout whitespace-pre-wrap text-secondary">{page.text}</p>
              )}
            </li>
          );
        })}
      </ul>

      <div>
        <Button onClick={onContinue}>Looks right — make a quiz</Button>
      </div>
    </div>
  );
}
