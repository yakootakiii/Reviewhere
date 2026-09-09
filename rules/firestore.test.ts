import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * The security boundary, exercised against the real rules engine.
 *
 * `AuthGuard` is a UX gate only — these rules are the actual boundary, so they
 * are tested in both directions: what an owner may do, and what a second user
 * and an anonymous caller may not.
 */
let env: RulesTestEnvironment;

const OWNER = "user-owner";
const OTHER = "user-other";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "reviewhere-rules-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => env?.cleanup());

/** Seeds through the admin context, which bypasses rules by design. */
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users", OWNER), {
      displayName: "Owner",
      email: "owner@example.com",
      photoURL: null,
      preferences: { theme: "system" },
    });
    await setDoc(doc(db, "documents", "doc-1"), {
      ownerId: OWNER,
      fileName: "Biology.pdf",
      pageCount: 3,
      fileType: "pdf",
      status: "ready",
      sizeBytes: 1000,
      tags: ["Biology"],
    });
    await setDoc(doc(db, "documents", "doc-1", "pages", "1"), { page: 1, text: "..." });
    await setDoc(doc(db, "quizzes", "quiz-1"), {
      ownerId: OWNER,
      documentId: "doc-1",
      title: "Biology",
      questionCount: 2,
      mix: { mcqPct: 50, idPct: 50 },
      difficulty: "medium",
      generationMode: "auto",
      lastAttemptScore: null,
      tags: [],
    });
    await setDoc(doc(db, "quizzes", "quiz-1", "questions", "q001"), { type: "mcq", prompt: "?" });
    await setDoc(doc(db, "attempts", "attempt-1"), {
      userId: OWNER,
      quizId: "quiz-1",
      score: 50,
      answers: [],
    });
    await setDoc(doc(db, "usage", OWNER), { day: "2026-09-10", modeACount: 3 });
  });
});

const owner = () => env.authenticatedContext(OWNER).firestore();
const other = () => env.authenticatedContext(OTHER).firestore();
const guest = () => env.unauthenticatedContext().firestore();

describe("documents", () => {
  it("lets the owner read, and nobody else", async () => {
    await assertSucceeds(getDoc(doc(owner(), "documents", "doc-1")));
    await assertFails(getDoc(doc(other(), "documents", "doc-1")));
    await assertFails(getDoc(doc(guest(), "documents", "doc-1")));
  });

  it("refuses client creates — the ingest route owns the page count", async () => {
    await assertFails(
      setDoc(doc(owner(), "documents", "forged"), { ownerId: OWNER, pageCount: 1 }),
    );
  });

  it("allows renaming and tagging", async () => {
    await assertSucceeds(updateDoc(doc(owner(), "documents", "doc-1"), { fileName: "New.pdf" }));
    await assertSucceeds(
      updateDoc(doc(owner(), "documents", "doc-1"), { tags: ["Biology", "Finals"] }),
    );
  });

  /** The comment always claimed this; until M6 only pageCount was enforced. */
  it("refuses to let the client rewrite server-derived fields", async () => {
    const ref = doc(owner(), "documents", "doc-1");
    await assertFails(updateDoc(ref, { pageCount: 999 }));
    await assertFails(updateDoc(ref, { status: "failed" }));
    await assertFails(updateDoc(ref, { fileType: "pptx" }));
    await assertFails(updateDoc(ref, { sizeBytes: 1 }));
    await assertFails(updateDoc(ref, { ownerId: OTHER }));
  });

  it("bounds the tag list", async () => {
    const tags = Array.from({ length: 21 }, (_, index) => `tag-${index}`);
    await assertFails(updateDoc(doc(owner(), "documents", "doc-1"), { tags }));
  });

  it("keeps extracted page text read-only to the owner", async () => {
    await assertSucceeds(getDoc(doc(owner(), "documents", "doc-1", "pages", "1")));
    await assertFails(getDoc(doc(other(), "documents", "doc-1", "pages", "1")));
    await assertFails(setDoc(doc(owner(), "documents", "doc-1", "pages", "1"), { text: "x" }));
  });

  it("lets the owner delete", async () => {
    await assertSucceeds(deleteDoc(doc(owner(), "documents", "doc-1")));
    await assertFails(deleteDoc(doc(other(), "documents", "doc-1")));
  });
});

describe("quizzes", () => {
  it("refuses client creates — both generation modes write server-side", async () => {
    await assertFails(setDoc(doc(owner(), "quizzes", "forged"), { ownerId: OWNER }));
  });

  it("allows retitling, tagging and recording a score", async () => {
    const ref = doc(owner(), "quizzes", "quiz-1");
    await assertSucceeds(updateDoc(ref, { title: "Renamed" }));
    await assertSucceeds(updateDoc(ref, { tags: ["Biology"] }));
    await assertSucceeds(updateDoc(ref, { lastAttemptScore: 80 }));
  });

  it("refuses to let the client rewrite how the quiz was made", async () => {
    const ref = doc(owner(), "quizzes", "quiz-1");
    await assertFails(updateDoc(ref, { questionCount: 99 }));
    await assertFails(updateDoc(ref, { documentId: "doc-2" }));
    await assertFails(updateDoc(ref, { generationMode: "manualCsv" }));
    await assertFails(updateDoc(ref, { difficulty: "hard" }));
  });

  it("keeps questions read-only to the owner", async () => {
    await assertSucceeds(getDoc(doc(owner(), "quizzes", "quiz-1", "questions", "q001")));
    await assertFails(getDoc(doc(other(), "quizzes", "quiz-1", "questions", "q001")));
    await assertFails(
      setDoc(doc(owner(), "quizzes", "quiz-1", "questions", "q001"), { prompt: "forged" }),
    );
  });
});

describe("attempts", () => {
  it("lets the owner record an attempt", async () => {
    await assertSucceeds(
      addDoc(collection(owner(), "attempts"), {
        userId: OWNER,
        quizId: "quiz-1",
        score: 80,
        answers: [],
      }),
    );
  });

  it("refuses an attempt filed under someone else", async () => {
    await assertFails(
      addDoc(collection(other(), "attempts"), { userId: OWNER, quizId: "quiz-1", score: 80, answers: [] }),
    );
  });

  it("rejects a nonsensical score", async () => {
    const write = (score: unknown) =>
      addDoc(collection(owner(), "attempts"), {
        userId: OWNER,
        quizId: "quiz-1",
        score,
        answers: [],
      });
    await assertFails(write(101));
    await assertFails(write(-1));
    await assertFails(write("perfect"));
  });

  /** Write-once: nothing in the app updates an attempt, so nothing may. */
  it("refuses updates to a recorded attempt", async () => {
    await assertFails(updateDoc(doc(owner(), "attempts", "attempt-1"), { score: 100 }));
  });

  it("lets the owner delete their own attempt, and nobody else's", async () => {
    await assertFails(deleteDoc(doc(other(), "attempts", "attempt-1")));
    await assertSucceeds(deleteDoc(doc(owner(), "attempts", "attempt-1")));
  });
});

describe("users and usage", () => {
  it("lets the owner update profile fields the sign-in path refreshes", async () => {
    const ref = doc(owner(), "users", OWNER);
    await assertSucceeds(updateDoc(ref, { displayName: "New Name" }));
    await assertSucceeds(updateDoc(ref, { preferences: { theme: "dark" } }));
    await assertSucceeds(updateDoc(ref, { email: "new@example.com", photoURL: null }));
  });

  /**
   * `updatePreferences` writes dotted paths ("preferences.theme"), not a whole
   * object — the shape an allow-list is easiest to get wrong against.
   */
  it("allows the dotted-path preference writes the settings page makes", async () => {
    await assertSucceeds(
      updateDoc(doc(owner(), "users", OWNER), {
        "preferences.theme": "dark",
        "preferences.timerEnabled": true,
      }),
    );
  });

  it("refuses unknown fields on a profile", async () => {
    await assertFails(updateDoc(doc(owner(), "users", OWNER), { plan: "premium" }));
  });

  it("keeps a profile private to its owner", async () => {
    await assertFails(getDoc(doc(other(), "users", OWNER)));
  });

  /** The daily Mode A cap would be pointless if its owner could reset it. */
  it("makes the usage counter readable but never writable by its owner", async () => {
    await assertSucceeds(getDoc(doc(owner(), "usage", OWNER)));
    await assertFails(setDoc(doc(owner(), "usage", OWNER), { day: "2026-09-10", modeACount: 0 }));
    await assertFails(getDoc(doc(other(), "usage", OWNER)));
  });
});
