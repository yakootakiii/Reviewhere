"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Library as LibraryIcon, List, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CardSkeleton, EmptyState, ErrorPanel } from "@/components/ui/feedback";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/auth-provider";
import { LibraryCard, type CardAction } from "@/components/library/library-card";
import { RenameDialog } from "@/components/library/rename-dialog";
import { TagEditor } from "@/components/library/tag-editor";
import {
  deleteDocument,
  listDocuments,
  renameDocument,
  updateDocumentTags,
} from "@/lib/firebase/documents";
import {
  deleteQuiz,
  duplicateQuiz,
  listQuizzes,
  renameQuiz,
  updateQuizTags,
} from "@/lib/firebase/quizzes";
import {
  allTags,
  buildLibraryItems,
  filterItems,
  sortItems,
  type LibraryItem,
  type LibraryKind,
  type LibrarySort,
} from "@/lib/library";
import { usePersistedValue } from "@/lib/persisted-state";
import { cn } from "@/lib/utils";
import type { Quiz, StudyDocument } from "@/lib/types";

type State =
  | { name: "loading" }
  | { name: "error" }
  | { name: "ready"; documents: StudyDocument[]; quizzes: Quiz[] };

type Dialog =
  | { name: "none" }
  | { name: "rename"; item: LibraryItem }
  | { name: "tags"; item: LibraryItem }
  | { name: "delete"; item: LibraryItem };

export default function LibraryPage() {
  return (
    // useSearchParams needs a Suspense boundary to prerender the shell.
    <Suspense fallback={<LibrarySkeleton />}>
      <Library />
    </Suspense>
  );
}

function Library() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [state, setState] = useState<State>({ name: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [kind, setKind] = useState<LibraryKind | "all">("all");
  const [sort, setSort] = useState<LibrarySort>("recent");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dialog, setDialog] = useState<Dialog>({ name: "none" });
  const [busy, setBusy] = useState(false);
  // Remembered per device; a view preference isn't worth a profile write.
  const [view, setView] = usePersistedValue<"grid" | "list">("reviewhere:library-view", "grid");

  // The ⌘K box in the top bar navigates here with ?q=, so the URL is the source
  // of truth for the query rather than a second piece of state to keep in sync.
  const query = searchParams.get("q") ?? "";

  useEffect(() => {
    if (!user) return;
    let active = true;

    Promise.all([listDocuments(user.uid, 200), listQuizzes(user.uid, 200)])
      .then(([documents, quizzes]) => {
        if (active) setState({ name: "ready", documents, quizzes });
      })
      .catch(() => {
        if (active) setState({ name: "error" });
      });

    return () => {
      active = false;
    };
  }, [user, reloadKey]);

  const items = useMemo(
    () =>
      state.name === "ready" ? buildLibraryItems(state.documents, state.quizzes) : [],
    [state],
  );
  const tags = useMemo(() => allTags(items), [items]);
  const visible = useMemo(
    () => sortItems(filterItems(items, { query, kind, tags: selectedTags }), sort),
    [items, query, kind, selectedTags, sort],
  );

  function setQuery(next: string) {
    router.replace(next ? `/library?q=${encodeURIComponent(next)}` : "/library");
  }

  function reload() {
    setReloadKey((key) => key + 1);
  }

  async function onAction(action: CardAction, item: LibraryItem) {
    if (action === "duplicate") {
      if (!user || item.kind !== "quiz") return;
      try {
        const copyId = await duplicateQuiz(user, item.id);
        toast(`Duplicated “${item.title}”.`, "success");
        router.push(`/quizzes/${copyId}`);
      } catch (error) {
        toast(error instanceof Error ? error.message : "Couldn't duplicate that.", "error");
      }
      return;
    }
    // Spelled out rather than `{ name: action }` so the union narrows.
    if (action === "rename") setDialog({ name: "rename", item });
    else if (action === "tags") setDialog({ name: "tags", item });
    else setDialog({ name: "delete", item });
  }

  async function onRename(value: string) {
    if (dialog.name !== "rename") return;
    const { item } = dialog;
    setBusy(true);
    try {
      if (item.kind === "document") await renameDocument(item.id, value);
      else await renameQuiz(item.id, value);
      toast("Renamed.", "success");
      setDialog({ name: "none" });
      reload();
    } catch {
      toast("Couldn't rename that. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveTags(next: string[]) {
    if (dialog.name !== "tags") return;
    const { item } = dialog;
    setBusy(true);
    try {
      if (item.kind === "document") await updateDocumentTags(item.id, next);
      else await updateQuizTags(item.id, next);
      toast("Tags saved.", "success");
      setDialog({ name: "none" });
      reload();
    } catch {
      toast("Couldn't save those tags. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (dialog.name !== "delete" || !user) return;
    const { item } = dialog;
    setBusy(true);
    try {
      if (item.kind === "document") await deleteDocument(user, item.id);
      else await deleteQuiz(user, item.id);
      toast(`Deleted “${item.title}”.`, "success");
      setDialog({ name: "none" });
      reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't delete that.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (state.name === "loading") return <LibrarySkeleton />;

  if (state.name === "error") {
    return (
      <div className="mx-auto max-w-6xl py-4">
        <ErrorPanel
          title="We couldn't load your library"
          description="Check your connection and try again."
          action={
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const filtered = query !== "" || selectedTags.length > 0 || kind !== "all";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 py-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-display">Library</h1>
        <p className="text-callout text-secondary">
          Every document you&apos;ve uploaded and the quizzes made from them.
        </p>
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-3">
          {/* The top bar's search is sm:-only, so the library carries its own. */}
          <div className="relative sm:hidden">
            <Search aria-hidden className="pointer-events-none absolute top-3 left-3 size-4 text-tertiary" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your library"
              aria-label="Search your library"
              className="h-11 w-full rounded-md border border-[var(--color-border-strong)] bg-surface pr-3 pl-9 text-callout outline-none placeholder:text-tertiary focus-visible:border-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              label="Filter by type"
              value={kind}
              onChange={setKind}
              options={[
                { value: "all", label: "All" },
                { value: "document", label: "Documents" },
                { value: "quiz", label: "Quizzes" },
              ]}
            />

            <label className="sr-only" htmlFor="library-sort">
              Sort
            </label>
            <select
              id="library-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as LibrarySort)}
              className="h-9 rounded-[10px] bg-surface-secondary px-3 text-caption font-medium text-secondary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              <option value="recent">Most recent</option>
              <option value="name">Name</option>
              <option value="score">Best score</option>
            </select>

            <SegmentedControl
              className="ml-auto"
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: "grid", label: "Grid", icon: <LayoutGrid aria-hidden className="size-3.5" /> },
                { value: "list", label: "List", icon: <List aria-hidden className="size-3.5" /> },
              ]}
            />
          </div>

          {tags.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const on = selectedTags.includes(tag);
                return (
                  <li key={tag}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setSelectedTags((current) =>
                          on ? current.filter((item) => item !== tag) : [...current, tag],
                        )
                      }
                      className={cn(
                        "rounded-full px-3 py-1 text-caption transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
                        on
                          ? "bg-[var(--color-accent)] text-white"
                          : "bg-surface-secondary text-secondary hover:text-primary",
                      )}
                    >
                      {tag}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Announced so a screen reader hears the count change as filters move. */}
      <p aria-live="polite" className="sr-only">
        {visible.length} item{visible.length === 1 ? "" : "s"} shown
      </p>

      {items.length === 0 ? (
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
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-6" />}
          title="Nothing matches those filters"
          description={
            query
              ? `No documents or quizzes match “${query}”.`
              : "No documents or quizzes match the filters you've picked."
          }
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setKind("all");
                setSelectedTags([]);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <ul
          className={cn(
            "grid gap-4",
            view === "grid" ? "sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1",
          )}
        >
          {visible.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <LibraryCard item={item} view={view} onAction={onAction} />
            </li>
          ))}
        </ul>
      )}

      {filtered && visible.length > 0 && (
        <p className="text-caption text-tertiary">
          {visible.length} of {items.length} shown
        </p>
      )}

      {dialog.name === "rename" && (
        <RenameDialog
          open
          onClose={() => setDialog({ name: "none" })}
          onSave={onRename}
          busy={busy}
          label={dialog.item.kind === "document" ? "File name" : "Quiz title"}
          initialValue={dialog.item.title}
        />
      )}

      {dialog.name === "tags" && (
        <TagEditor
          open
          onClose={() => setDialog({ name: "none" })}
          onSave={onSaveTags}
          busy={busy}
          title={dialog.item.title}
          initialTags={dialog.item.tags}
          suggestions={tags}
        />
      )}

      {dialog.name === "delete" && (
        <ConfirmDialog
          open
          onClose={() => setDialog({ name: "none" })}
          onConfirm={onDelete}
          busy={busy}
          title={`Delete “${dialog.item.title}”?`}
          description={
            dialog.item.kind === "document"
              ? "This removes the document and its extracted text. Quizzes made from it are kept and stay playable, but their page links will stop working."
              : "This removes the quiz, its questions and every attempt you've made at it. This can't be undone."
          }
        />
      )}
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 py-4" aria-busy="true">
      <div className="flex flex-col gap-1">
        <h1 className="text-display">Library</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
