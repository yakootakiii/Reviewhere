"use client";

import Link from "next/link";
import {
  Copy,
  FileText,
  ListChecks,
  PencilLine,
  Presentation,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Menu, MenuItem } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import type { LibraryItem } from "@/lib/library";

export type CardAction = "rename" | "tags" | "delete" | "duplicate";

function formatDate(ms: number): string {
  if (!ms) return "Just now";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Declared at module scope rather than picked with `const Icon = iconFor(item)`:
 * choosing a component type during render resets its state on every render, and
 * `react-hooks/static-components` is an error here.
 */
function ItemIcon({ item }: { item: LibraryItem }) {
  if (item.kind === "quiz") {
    return item.quiz.generationMode === "auto" ? (
      <Sparkles aria-hidden className="size-5" />
    ) : (
      <PencilLine aria-hidden className="size-5" />
    );
  }
  return item.document.fileType === "pptx" ? (
    <Presentation aria-hidden className="size-5" />
  ) : (
    <FileText aria-hidden className="size-5" />
  );
}

/**
 * One card for both kinds (§2.6). The layout is shared and only the metadata
 * line and the available actions differ — quizzes can be duplicated, documents
 * cannot.
 */
export function LibraryCard({
  item,
  view,
  onAction,
}: {
  item: LibraryItem;
  view: "grid" | "list";
  /** Omit to render a read-only card, as the dashboard does. */
  onAction?: (action: CardAction, item: LibraryItem) => void;
}) {
  const list = view === "list";

  return (
    <Link href={item.href} className="rounded-xl outline-offset-2">
      <Card
        interactive
        className={cn("flex h-full gap-3", list ? "items-center py-3" : "flex-col")}
      >
        <div className={cn("flex items-start gap-3", list && "flex-1 items-center")}>
          <div
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-[var(--color-accent)]"
          >
            <ItemIcon item={item} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-callout font-medium" title={item.title}>
                {item.title}
              </h3>
              <span className="shrink-0 rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] text-tertiary">
                {item.kind === "quiz" ? "Quiz" : "Document"}
              </span>
            </div>
            <p className="truncate text-caption text-secondary">
              {item.subtitle} · {formatDate(item.createdAt)}
            </p>
          </div>

          {list && <ScoreBadge item={item} />}

          {onAction && (
          <Menu label={`Actions for ${item.title}`}>
            {(close) => (
              <>
                <MenuItem
                  icon={<PencilLine aria-hidden className="size-4" />}
                  onClick={() => {
                    close();
                    onAction("rename", item);
                  }}
                >
                  Rename
                </MenuItem>
                <MenuItem
                  icon={<Tag aria-hidden className="size-4" />}
                  onClick={() => {
                    close();
                    onAction("tags", item);
                  }}
                >
                  Edit tags
                </MenuItem>
                {item.kind === "quiz" && (
                  <MenuItem
                    icon={<Copy aria-hidden className="size-4" />}
                    onClick={() => {
                      close();
                      onAction("duplicate", item);
                    }}
                  >
                    Duplicate
                  </MenuItem>
                )}
                <MenuItem
                  destructive
                  icon={<Trash2 aria-hidden className="size-4" />}
                  onClick={() => {
                    close();
                    onAction("delete", item);
                  }}
                >
                  Delete
                </MenuItem>
              </>
            )}
          </Menu>
          )}
        </div>

        {!list && (
          <div className="mt-auto flex items-center justify-between gap-2">
            <TagRow tags={item.tags} />
            <ScoreBadge item={item} />
          </div>
        )}

        {list && item.tags.length > 0 && <TagRow tags={item.tags} />}
      </Card>
    </Link>
  );
}

function TagRow({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span />;
  return (
    <ul className="flex min-w-0 flex-wrap gap-1">
      {tags.slice(0, 3).map((tag) => (
        <li
          key={tag}
          className="truncate rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] text-secondary"
        >
          {tag}
        </li>
      ))}
      {tags.length > 3 && (
        <li className="text-[11px] text-tertiary">+{tags.length - 3}</li>
      )}
    </ul>
  );
}

function ScoreBadge({ item }: { item: LibraryItem }) {
  if (item.kind !== "quiz" || item.score === null) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-caption text-secondary tabular-nums">
      <ListChecks aria-hidden className="size-3.5" />
      {item.score}%
    </span>
  );
}
