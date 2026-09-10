import { describe, expect, it } from "vitest";
import {
  allTags,
  buildLibraryItems,
  cleanTag,
  filterItems,
  matchesQuery,
  normalizeForSearch,
  sortItems,
} from "./library";
import type { Quiz, StudyDocument } from "./types";

const stamp = (ms: number) => ({ toDate: () => new Date(ms) }) as StudyDocument["createdAt"];

function document(id: string, fileName: string, tags?: string[], ms = 1_000): StudyDocument {
  return {
    id,
    ownerId: "user-1",
    fileName,
    storagePath: "",
    pageCount: 12,
    fileType: "pdf",
    status: "ready",
    sizeBytes: 100,
    createdAt: stamp(ms),
    tags,
  };
}

function quiz(id: string, title: string, tags?: string[], score: number | null = null, ms = 2_000): Quiz {
  return {
    id,
    ownerId: "user-1",
    documentId: "doc-1",
    title,
    questionCount: 20,
    mix: { mcqPct: 60, idPct: 40 },
    difficulty: "mixed",
    generationMode: "auto",
    createdAt: stamp(ms) as Quiz["createdAt"],
    lastAttemptScore: score,
    tags,
  };
}

const documents = [
  document("doc-1", "Biology Week 3.pdf", ["Biology"], 1_000),
  document("doc-2", "Rizal Notes.pdf", ["History", "Finals Week"], 3_000),
];
const quizzes = [
  quiz("quiz-1", "Biology Week 3", ["Biology"], 80, 2_000),
  quiz("quiz-2", "Rizal Notes", [], 45, 4_000),
];

describe("buildLibraryItems", () => {
  const items = buildLibraryItems(documents, quizzes);

  it("folds documents and quizzes into one list", () => {
    expect(items).toHaveLength(4);
    expect(items.filter((item) => item.kind === "document")).toHaveLength(2);
  });

  it("counts the quizzes made from each document", () => {
    const first = items.find((item) => item.id === "doc-1");
    expect(first?.kind === "document" && first.quizCount).toBe(2);
    expect(first?.subtitle).toContain("2 quizzes");
  });

  it("says slides rather than pages for a deck", () => {
    const deck = { ...document("doc-3", "Lecture.pptx"), fileType: "pptx" as const };
    expect(buildLibraryItems([deck], [])[0].subtitle).toContain("slides");
  });

  it("links each item at its own route", () => {
    expect(items.find((item) => item.id === "doc-1")?.href).toBe("/documents/doc-1");
    expect(items.find((item) => item.id === "quiz-1")?.href).toBe("/quizzes/quiz-1");
  });

  it("treats a missing createdAt as the oldest rather than crashing", () => {
    const pending = { ...document("doc-4", "Fresh.pdf"), createdAt: null };
    expect(buildLibraryItems([pending], [])[0].createdAt).toBe(0);
  });
});

describe("matchesQuery", () => {
  const items = buildLibraryItems(documents, quizzes);
  const find = (query: string) => filterItems(items, { query }).map((item) => item.id);

  it("ignores case and punctuation", () => {
    expect(normalizeForSearch("Week-3!")).toBe("week 3");
    expect(find("biology week 3")).toEqual(["doc-1", "quiz-1"]);
    expect(find("BIOLOGY")).toEqual(["doc-1", "quiz-1"]);
  });

  it("matches on tags as well as titles", () => {
    expect(find("finals week")).toEqual(["doc-2"]);
  });

  it("returns everything for an empty query", () => {
    expect(find("   ")).toHaveLength(4);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(find("chemistry")).toEqual([]);
  });

  it("matches a partial word", () => {
    expect(matchesQuery(buildLibraryItems([documents[1]], [])[0], "riz")).toBe(true);
  });
});

describe("filterItems", () => {
  const items = buildLibraryItems(documents, quizzes);

  it("filters by kind", () => {
    expect(filterItems(items, { kind: "quiz" })).toHaveLength(2);
    expect(filterItems(items, { kind: "document" })).toHaveLength(2);
    expect(filterItems(items, { kind: "all" })).toHaveLength(4);
  });

  it("filters by tag, ignoring case", () => {
    expect(filterItems(items, { tags: ["biology"] }).map((item) => item.id)).toEqual([
      "doc-1",
      "quiz-1",
    ]);
  });

  it("narrows rather than widens when several tags are selected", () => {
    expect(filterItems(items, { tags: ["History", "Finals Week"] }).map((item) => item.id)).toEqual([
      "doc-2",
    ]);
    // doc-1 has Biology but not History, so requiring both excludes it.
    expect(filterItems(items, { tags: ["Biology", "History"] })).toEqual([]);
  });

  it("combines a query, a kind and a tag", () => {
    expect(
      filterItems(items, { query: "biology", kind: "quiz", tags: ["Biology"] }).map((i) => i.id),
    ).toEqual(["quiz-1"]);
  });
});

describe("sortItems", () => {
  const items = buildLibraryItems(documents, quizzes);

  it("sorts by most recent first", () => {
    expect(sortItems(items, "recent").map((item) => item.id)).toEqual([
      "quiz-2",
      "doc-2",
      "quiz-1",
      "doc-1",
    ]);
  });

  it("sorts by name", () => {
    expect(sortItems(items, "name")[0].title).toBe("Biology Week 3");
  });

  it("sorts scored quizzes first and never drops the unscored", () => {
    const sorted = sortItems(items, "score");
    expect(sorted.map((item) => item.id).slice(0, 2)).toEqual(["quiz-1", "quiz-2"]);
    // Documents have no score but still appear.
    expect(sorted).toHaveLength(4);
  });

  it("leaves the input array untouched", () => {
    const before = items.map((item) => item.id);
    sortItems(items, "name");
    expect(items.map((item) => item.id)).toEqual(before);
  });
});

describe("allTags", () => {
  it("collects tags across both kinds, de-duplicated case-insensitively", () => {
    const items = buildLibraryItems(
      [document("d", "A.pdf", ["Biology", "biology"])],
      [quiz("q", "B", ["BIOLOGY", "History"])],
    );
    expect(allTags(items)).toEqual(["Biology", "History"]);
  });

  it("is empty when nothing is tagged", () => {
    expect(allTags(buildLibraryItems([document("d", "A.pdf")], []))).toEqual([]);
  });
});

describe("cleanTag", () => {
  it("trims, collapses and caps", () => {
    expect(cleanTag("  Finals   Week ")).toBe("Finals Week");
    expect(cleanTag("x".repeat(40))).toHaveLength(24);
  });
});

describe("shared quizzes", () => {
  const mine = quiz("quiz-1", "My reviewer", ["Biology"], 80, 2_000);
  const theirs: Quiz = {
    ...quiz("quiz-2", "Their reviewer", ["Their tag"], 90, 5_000),
    ownerId: "user-2",
    ownerName: "Ana",
    sharedWith: ["user-1"],
  };
  const items = buildLibraryItems([], [mine], [theirs]);

  it("lists shared quizzes alongside your own", () => {
    expect(items.map((item) => item.id)).toEqual(["quiz-1", "quiz-2"]);
  });

  it("marks which are shared", () => {
    const [own, shared] = items;
    expect(own.kind === "quiz" && own.shared).toBe(false);
    expect(shared.kind === "quiz" && shared.shared).toBe(true);
  });

  it("names who shared it, so a borrowed quiz isn't mistaken for your own", () => {
    expect(items[1].subtitle).toContain("Shared by Ana");
  });

  it("falls back gracefully when the owner's name was never stamped", () => {
    const anonymous = { ...theirs, ownerName: undefined };
    expect(buildLibraryItems([], [], [anonymous])[0].subtitle).toContain("Shared by someone");
  });

  /** The owner's score is not the recipient's, and their tags aren't either. */
  it("does not carry the owner's score or tags onto a shared quiz", () => {
    const shared = items[1];
    expect(shared.kind === "quiz" && shared.score).toBeNull();
    expect(shared.tags).toEqual([]);
  });

  it("still finds a shared quiz by title", () => {
    expect(filterItems(items, { query: "their" }).map((item) => item.id)).toEqual(["quiz-2"]);
  });

  it("treats an absent shared list as none", () => {
    expect(buildLibraryItems([], [mine])).toHaveLength(1);
  });
});
