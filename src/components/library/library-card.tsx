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

  // A widget rather than a card: a square tile with a label at the top, the
  // one number that matters in the middle, and identity at the foot. The
  // proportions do the work, so it needs no border or shadow to read as an
  // object — a fill against the page is enough.
  const metric =
    item.kind === "quiz"
      ? { value: item.quiz.questionCount, label: "questions" }
      : {
          value: item.document.pageCount,
          label: item.document.fileType === "pptx" ? "slides" : "pages",
        };

  return (
    <div className="group relative flex aspect-square flex-col rounded-2xl bg-surface-secondary p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 text-caption text-tertiary">
          <KindMark item={item} />
          {item.kind === "quiz" ? "Quiz" : item.document.fileType === "pptx" ? "PPTX" : "PDF"}
        </span>
        {actions && (
          <span className="relative z-10 -mt-1 -mr-1">
            <Actions item={item} onAction={actions} />
          </span>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <p className="flex items-baseline gap-1.5">
          <span className="text-[34px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
            {metric.value}
          </span>
          <span className="text-caption text-tertiary">{metric.label}</span>
        </p>

        <div className="flex flex-col gap-0.5">
          <Link href={item.href} className="rounded-sm outline-offset-4">
            {/* The whole tile is clickable via this overlay, so the link text
                stays the accessible name without a second nested control. */}
            <span className="absolute inset-0" aria-hidden />
            <span className="line-clamp-2 [overflow-wrap:anywhere] text-callout font-medium">
              {item.title}
            </span>
          </Link>
          <p className="truncate text-caption text-tertiary">{tileMeta(item)}</p>
        </div>
      </div>
    </div>
  );
}

/** The supporting line under a tile's title — whatever the metric didn't say. */
function tileMeta(item: LibraryItem): string {
  if (item.kind === "quiz") {
    if (item.shared) return item.subtitle.split(" · ").slice(1).join(" · ");
    return item.score !== null ? `Last score ${item.score}%` : formatDate(item.createdAt);
  }
  // §3.3: a scan waiting to be read has no text yet, so "0 quizzes" would be
  // the least useful thing to say about it.
  if (item.document.status === "processing") return "Needs reading";
  const count = item.quizCount;
  return `${count} quiz${count === 1 ? "" : "zes"} · ${formatDate(item.createdAt)}`;
}
