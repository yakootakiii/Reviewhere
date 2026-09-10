/**
 * The Library's view model (§2.6). Documents and quizzes are folded into one
 * list so search, tag filters and sorting work across both without the page
 * component growing a second code path for each.
 *
 * Everything here is pure: filtering runs client-side over already-loaded data,
 * which at this app's scale (§3.2, ~4–5 users) is one round trip instead of a
 * Firestore query per keystroke, and makes "no results" instant.
 */
import type { Quiz, StudyDocument } from "@/lib/types";

export type LibraryKind = "document" | "quiz";
export type LibrarySort = "recent" | "name" | "score";

interface LibraryItemBase {
  id: string;
  title: string;
  /** Metadata line under the title. */
  subtitle: string;
  tags: string[];
  href: string;
  /** Epoch ms; 0 when Firestore hasn't stamped createdAt yet. */
  createdAt: number;
}

export interface DocumentItem extends LibraryItemBase {
  kind: "document";
  document: StudyDocument;
  quizCount: number;
}

export interface QuizItem extends LibraryItemBase {
  kind: "quiz";
  quiz: Quiz;
  score: number | null;
}

export type LibraryItem = DocumentItem | QuizItem;

function toMillis(value: { toDate?: () => Date } | null | undefined): number {
  const date = value?.toDate?.();
  return date ? date.getTime() : 0;
}

export function buildLibraryItems(
  documents: StudyDocument[],
  quizzes: Quiz[],
): LibraryItem[] {
  const quizCounts = new Map<string, number>();
  for (const quiz of quizzes) {
    quizCounts.set(quiz.documentId, (quizCounts.get(quiz.documentId) ?? 0) + 1);
  }

  const documentItems: LibraryItem[] = documents.map((document) => {
    const unit = document.fileType === "pptx" ? "slides" : "pages";
    const count = quizCounts.get(document.id) ?? 0;
    return {
      kind: "document",
      id: document.id,
      title: document.fileName,
      subtitle: `${document.pageCount} ${unit} · ${count} quiz${count === 1 ? "" : "zes"}`,
      tags: document.tags ?? [],
      href: `/documents/${document.id}`,
      createdAt: toMillis(document.createdAt),
      document,
      quizCount: count,
    };
  });

  const quizItems: LibraryItem[] = quizzes.map((quiz) => ({
    kind: "quiz",
    id: quiz.id,
    title: quiz.title,
    // The mix belongs on the quiz page; on a card it only crowds out the date.
    subtitle: `${quiz.questionCount} questions`,
    tags: quiz.tags ?? [],
    href: `/quizzes/${quiz.id}`,
    createdAt: toMillis(quiz.createdAt),
    quiz,
    score: quiz.lastAttemptScore ?? null,
  }));

  return [...documentItems, ...quizItems];
}

/** Case- and punctuation-insensitive, so "week 3" finds "Week-3". */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesQuery(item: LibraryItem, query: string): boolean {
  const needle = normalizeForSearch(query);
  if (!needle) return true;
  const haystack = normalizeForSearch([item.title, ...item.tags].join(" "));
  return haystack.includes(needle);
}

export interface LibraryFilters {
  query?: string;
  kind?: LibraryKind | "all";
  tags?: string[];
}

export function filterItems(items: LibraryItem[], filters: LibraryFilters): LibraryItem[] {
  const wanted = (filters.tags ?? []).map((tag) => tag.toLowerCase());

  return items.filter((item) => {
    if (filters.kind && filters.kind !== "all" && item.kind !== filters.kind) return false;
    if (!matchesQuery(item, filters.query ?? "")) return false;
    if (wanted.length === 0) return true;
    // Every selected tag must be present — chips narrow, they don't widen.
    const own = item.tags.map((tag) => tag.toLowerCase());
    return wanted.every((tag) => own.includes(tag));
  });
}

export function sortItems(items: LibraryItem[], sort: LibrarySort): LibraryItem[] {
  const sorted = [...items];

  if (sort === "name") {
    return sorted.sort((a, b) => a.title.localeCompare(b.title));
  }
  if (sort === "score") {
    // Documents have no score; they sink below every scored quiz rather than
    // being dropped, so the list never loses items to a sort.
    const score = (item: LibraryItem) => (item.kind === "quiz" && item.score !== null ? item.score : -1);
    return sorted.sort((a, b) => score(b) - score(a) || b.createdAt - a.createdAt);
  }
  return sorted.sort((a, b) => b.createdAt - a.createdAt);
}

/** Tag chips for the filter bar, de-duplicated case-insensitively. */
export function allTags(items: LibraryItem[]): string[] {
  const seen = new Map<string, string>();
  for (const item of items) {
    for (const tag of item.tags) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) seen.set(key, tag);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Normalizes a typed tag: trimmed, collapsed, and capped so chips stay chips. */
export function cleanTag(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 24);
}
