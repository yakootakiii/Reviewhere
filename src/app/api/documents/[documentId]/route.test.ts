import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = await vi.hoisted(async () => {
  const { createFakeFirestore } = await import("@/lib/firebase/firestore-fake");
  return { store: createFakeFirestore(), uid: "user-123" as string | null, configured: true };
});

vi.mock("@/lib/firebase/admin", () => ({
  get isAdminConfigured() {
    return fake.configured;
  },
  uidFromAuthHeader: async () => fake.uid,
  adminDb: () => fake.store.db,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "SERVER_TIMESTAMP" },
}));

const { DELETE } = await import("./route");

function seedDocument(ownerId = "user-123") {
  fake.store.docs.set("documents/doc-1", {
    ownerId,
    fileName: "Biology Week 3.pdf",
    pageCount: 3,
    fileType: "pdf",
    status: "ready",
  });
  for (const page of [1, 2, 3]) {
    fake.store.docs.set(`documents/doc-1/pages/${page}`, { page, text: `Page ${page} text` });
  }
  // A quiz generated from it, with its own questions.
  fake.store.docs.set("quizzes/quiz-1", { ownerId, documentId: "doc-1", title: "Biology Week 3" });
  fake.store.docs.set("quizzes/quiz-1/questions/q001", { type: "mcq", prompt: "?" });
}

const params = Promise.resolve({ documentId: "doc-1" });

function request() {
  return new Request("http://localhost/api/documents/doc-1", {
    method: "DELETE",
    headers: { authorization: "Bearer token" },
  });
}

beforeEach(() => {
  fake.store.reset();
  fake.uid = "user-123";
  fake.configured = true;
});

describe("DELETE /api/documents/[documentId]", () => {
  it("rejects an unauthenticated caller", async () => {
    fake.uid = null;
    seedDocument();
    expect((await DELETE(request(), { params })).status).toBe(401);
    expect(fake.store.docs.has("documents/doc-1")).toBe(true);
  });

  it("refuses to delete someone else's document", async () => {
    seedDocument("someone-else");
    const response = await DELETE(request(), { params });
    expect(response.status).toBe(404);
    expect(fake.store.docs.has("documents/doc-1")).toBe(true);
    expect(fake.store.pathsUnder("documents/doc-1/pages/")).toHaveLength(3);
  });

  /**
   * The bug this route exists to fix: deleting the parent from the client left
   * every page row behind with nothing referencing it.
   */
  it("deletes the extracted page text along with the document", async () => {
    seedDocument();
    expect((await DELETE(request(), { params })).status).toBe(200);

    expect(fake.store.docs.has("documents/doc-1")).toBe(false);
    expect(fake.store.pathsUnder("documents/doc-1/pages/")).toEqual([]);
  });

  /** Per the M5 decision: a quiz outlives its source and stays playable. */
  it("keeps quizzes generated from the document, questions and all", async () => {
    seedDocument();
    await DELETE(request(), { params });

    expect(fake.store.docs.get("quizzes/quiz-1")).toMatchObject({ documentId: "doc-1" });
    expect(fake.store.pathsUnder("quizzes/quiz-1/questions/")).toHaveLength(1);
  });
});
