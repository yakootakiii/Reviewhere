"use client";

import Link from "next/link";
import { Copy, FileText, PencilLine, Presentation, Tag, Trash2 } from "lucide-react";
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
 * A quiz needs no icon of its own — it is the default thing here. Only the two
 * document formats get a glyph, because file type is the one thing you scan
 * for that the text doesn't already say.
 */
function KindMark({ item }: { item: LibraryItem }) {
  if (item.kind === "quiz") return null;
  const Icon = item.document.fileType === "pptx" ? Presentation : FileText;
  return <Icon aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-tertiary" />;
}

function Meta({ item }: { item: LibraryItem }) {
  return (
    <p className="truncate text-caption text-tertiary">
      {item.kind === "quiz" ? "Quiz" : "Document"} · {item.subtitle} · {formatDate(item.createdAt)}
    </p>
  );
}

function Tags({ tags, className }: { tags: string[]; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {tags.slice(0, 3).map((tag) => (
        <li
          key={tag}
          className="truncate rounded-sm bg-surface-secondary px-1.5 py-0.5 text-[11px] text-secondary"
        >
          {tag}
        </li>
      ))}
      {tags.length > 3 && <li className="text-[11px] text-tertiary">+{tags.length - 3}</li>}
    </ul>
  );
}

function Actions({
  item,
  onAction,
}: {
  item: LibraryItem;
  onAction: (action: CardAction, item: LibraryItem) => void;
}) {
  return (
    <Menu label={`Actions for ${item.title}`}>
      {(close) => (
        <>
          <MenuItem
            icon={<PencilLine aria-hidden className="size-4 text-tertiary" />}
            onClick={() => {
              close();
              onAction("rename", item);
            }}
          >
            Rename
          </MenuItem>
          <MenuItem
            icon={<Tag aria-hidden className="size-4 text-tertiary" />}
            onClick={() => {
              close();
              onAction("tags", item);
            }}
          >
            Edit tags
          </MenuItem>
          {item.kind === "quiz" && (
            <MenuItem
              icon={<Copy aria-hidden className="size-4 text-tertiary" />}
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
  );
}

/**
 * One item, in either of two shapes. The list shape is a genuine row — the
 * dividers belong to the list, so rows don't each carry a box.
 */
export function LibraryCard({
  item,
  view,
  onAction,
}: {
  item: LibraryItem;
  view: "grid" | "list";
  /** Omit to render a read-only item, as the dashboard does. */
  onAction?: (action: CardAction, item: LibraryItem) => void;
}) {
  // Every action in the menu is one a recipient may not perform, so a shared
  // quiz simply doesn't get one.
  const actions = item.kind === "quiz" && item.shared ? undefined : onAction;
  const score =
    item.kind === "quiz" && item.score !== null ? (
      <span className="shrink-0 text-caption text-secondary tabular-nums">{item.score}%</span>
    ) : null;

  if (view === "list") {
    return (
      <div className="group flex items-center gap-4 py-3.5">
        <Link href={item.href} className="min-w-0 flex-1 rounded-sm outline-offset-4">
          <span className="flex items-center gap-2">
            <KindMark item={item} />
            <span className="truncate text-callout font-medium">{item.title}</span>
          </span>
          <Meta item={item} />
        </Link>
        <Tags tags={item.tags} className="hidden sm:flex" />
        {score}
        {actions && <Actions item={item} onAction={actions} />}
      </div>
    );
  }

  return (
    <div className="group relative flex h-full flex-col rounded-lg bg-surface hairline p-4 transition-colors duration-150 hover:border-[var(--color-border-strong)]">
      <div className="flex items-start gap-2">
        <Link href={item.href} className="min-w-0 flex-1 rounded-sm outline-offset-4">
          <span className="flex items-center gap-2">
            <KindMark item={item} />
            <span className="truncate text-callout font-medium">{item.title}</span>
          </span>
          <Meta item={item} />
        </Link>
        {actions && <Actions item={item} onAction={actions} />}
      </div>

      {(item.tags.length > 0 || score) && (
        <div className="mt-6 flex items-end justify-between gap-3">
          <Tags tags={item.tags} />
          {score}
        </div>
      )}
    </div>
  );
}
