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
const { POST: DUPLICATE } = await import("./duplicate/route");

function seedQuiz(quizId = "quiz-1", ownerId = "user-123") {
  fake.store.docs.set(`quizzes/${quizId}`, {
    ownerId,
    documentId: "doc-1",
    title: "Biology Week 3",
    questionCount: 2,
    mix: { mcqPct: 50, idPct: 50 },
    difficulty: "medium",
    generationMode: "auto",
    lastAttemptScore: 80,
  });
  fake.store.docs.set(`quizzes/${quizId}/questions/q001`, {
    type: "mcq",
    prompt: "Which organelle produces ATP?",
    choices: ["a", "b", "c", "d"],
    correctAnswer: "a",
    explanation: "because",
    sourcePage: 1,
    difficulty: "medium",
  });
  fake.store.docs.set(`quizzes/${quizId}/questions/q002`, {
    type: "identification",
    prompt: "Name it.",
    correctAnswer: "mitochondria",
    explanation: "because",
    sourcePage: 2,
    difficulty: "medium",
  });
  fake.store.docs.set("attempts/a1", { userId: ownerId, quizId, score: 80, answers: [] });
  fake.store.docs.set("attempts/a2", { userId: ownerId, quizId: "other-quiz", score: 10, answers: [] });
}

function request(method: string) {
  return new Request("http://localhost/api/quizzes/quiz-1", {
    method,
    headers: { authorization: "Bearer token" },
  });
}

const params = Promise.resolve({ quizId: "quiz-1" });

beforeEach(() => {
  fake.store.reset();
  fake.uid = "user-123";
  fake.configured = true;
});

describe("DELETE /api/quizzes/[quizId]", () => {
  it("rejects an unauthenticated caller", async () => {
    fake.uid = null;
    seedQuiz();
    expect((await DELETE(request("DELETE"), { params })).status).toBe(401);
    expect(fake.store.docs.has("quizzes/quiz-1")).toBe(true);
  });

  it("refuses to delete someone else's quiz", async () => {
    seedQuiz("quiz-1", "someone-else");
    expect((await DELETE(request("DELETE"), { params })).status).toBe(404);
    expect(fake.store.docs.has("quizzes/quiz-1")).toBe(true);
  });

  /** The bug this route exists to fix: a plain delete orphaned the questions. */
  it("deletes the questions subcollection, not just the quiz", async () => {
    seedQuiz();
    expect((await DELETE(request("DELETE"), { params })).status).toBe(200);

    expect(fake.store.docs.has("quizzes/quiz-1")).toBe(false);
    expect(fake.store.pathsUnder("quizzes/quiz-1/questions/")).toEqual([]);
  });

  it("removes this quiz's attempts and leaves other quizzes' attempts alone", async () => {
    seedQuiz();
    await DELETE(request("DELETE"), { params });

    expect(fake.store.docs.has("attempts/a1")).toBe(false);
    expect(fake.store.docs.has("attempts/a2")).toBe(true);
  });
});

describe("POST /api/quizzes/[quizId]/duplicate", () => {
  it("copies the quiz and every question", async () => {
    seedQuiz();
    const response = await DUPLICATE(request("POST"), { params });
    expect(response.status).toBe(200);

    const { quizId } = (await response.json()) as { quizId: string };
    expect(quizId).not.toBe("quiz-1");
    expect(fake.store.pathsUnder(`quizzes/${quizId}/questions/`)).toHaveLength(2);
    // Question ids carry the interleaved order, so the copy keeps them verbatim.
    expect(fake.store.docs.get(`quizzes/${quizId}/questions/q001`)).toMatchObject({ type: "mcq" });
  });

  it("names the copy and gives it no inherited history", async () => {
    seedQuiz();
    const { quizId } = (await (await DUPLICATE(request("POST"), { params })).json()) as {
      quizId: string;
    };
    expect(fake.store.docs.get(`quizzes/${quizId}`)).toMatchObject({
      title: "Biology Week 3 (copy)",
      lastAttemptScore: null,
      ownerId: "user-123",
    });
    // The original is untouched.
    expect(fake.store.docs.get("quizzes/quiz-1")).toMatchObject({ lastAttemptScore: 80 });
  });

  it("refuses to duplicate someone else's quiz", async () => {
    seedQuiz("quiz-1", "someone-else");
    expect((await DUPLICATE(request("POST"), { params })).status).toBe(404);
  });
});
