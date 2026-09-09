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

const { POST } = await import("./route");

const settings = { questionCount: 10, mcqPct: 50, difficulty: "medium", scope: null };

const mcqRow = {
  type: "mcq",
  question: "Which organelle produces ATP?",
  choice_a: "Ribosome",
  choice_b: "Mitochondrion",
  choice_c: "Nucleus",
  choice_d: "Golgi",
  correct_answer: "Mitochondrion",
  accepted_answers: "",
  explanation: "It runs oxidative phosphorylation.",
  source_page: "2",
};

const identificationRow = {
  type: "identification",
  question: "Name the powerhouse of the cell.",
  choice_a: "",
  choice_b: "",
  choice_c: "",
  choice_d: "",
  correct_answer: "Mitochondria",
  accepted_answers: "mitochondrion",
  explanation: "Both spellings are accepted.",
  source_page: "3",
};

function seedDocument(ownerId = "user-123") {
  fake.store.docs.set("documents/doc-1", {
    ownerId,
    fileName: "Biology Week 3.pdf",
    pageCount: 4,
    fileType: "pdf",
    status: "ready",
  });
}

function importRows(body: unknown, auth = "Bearer token") {
  return POST(
    new Request("http://localhost/api/quizzes/import", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { authorization: auth, "content-type": "application/json" },
    }),
  );
}

beforeEach(() => {
  fake.store.reset();
  fake.uid = "user-123";
  fake.configured = true;
});

describe("POST /api/quizzes/import", () => {
  it("rejects an unauthenticated caller", async () => {
    fake.uid = null;
    expect((await importRows({ documentId: "doc-1", settings, rows: [mcqRow] })).status).toBe(401);
  });

  it("refuses to import into someone else's document", async () => {
    seedDocument("someone-else");
    const response = await importRows({ documentId: "doc-1", settings, rows: [mcqRow] });
    expect(response.status).toBe(400);
    expect(fake.store.pathsUnder("quizzes/")).toHaveLength(0);
  });

  it("saves the rows and marks the quiz as a manual import", async () => {
    seedDocument();
    const response = await importRows({
      documentId: "doc-1",
      settings,
      rows: [mcqRow, identificationRow],
    });

    expect(response.status).toBe(200);
    const { quizId, questionCount } = (await response.json()) as {
      quizId: string;
      questionCount: number;
    };
    expect(questionCount).toBe(2);
    expect(fake.store.docs.get(`quizzes/${quizId}`)).toMatchObject({
      generationMode: "manualCsv",
      title: "Biology Week 3",
      questionCount: 2,
    });
    expect(fake.store.pathsUnder(`quizzes/${quizId}/questions/`)).toHaveLength(2);
  });

  /**
   * The point of §2.2: nothing downstream can tell the two modes apart, so an
   * imported question is stored in exactly the shape a generated one would be.
   */
  it("stores a question in the same shape either mode would produce", async () => {
    seedDocument();
    const response = await importRows({ documentId: "doc-1", settings, rows: [identificationRow] });
    const { quizId } = (await response.json()) as { quizId: string };

    expect(fake.store.docs.get(`quizzes/${quizId}/questions/q001`)).toEqual({
      type: "identification",
      prompt: "Name the powerhouse of the cell.",
      correctAnswer: "Mitochondria",
      acceptedAnswers: ["mitochondrion"],
      explanation: "Both spellings are accepted.",
      sourcePage: 3,
      difficulty: "medium",
    });
  });

  it("re-validates server-side and saves nothing when a row is bad", async () => {
    seedDocument();
    const response = await importRows({
      documentId: "doc-1",
      settings,
      rows: [mcqRow, { ...mcqRow, choice_d: "", source_page: "99" }],
    });

    expect(response.status).toBe(422);
    const body = (await response.json()) as { rowErrors: { rowNumber: number; errors: string[] }[] };
    expect(body.rowErrors).toHaveLength(1);
    // The header is row 1, so the second data row is row 3.
    expect(body.rowErrors[0].rowNumber).toBe(3);
    expect(body.rowErrors[0].errors).toHaveLength(2);
    expect(fake.store.pathsUnder("quizzes/")).toHaveLength(0);
  });

  it("rejects an import with no rows at all", async () => {
    seedDocument();
    const response = await importRows({ documentId: "doc-1", settings, rows: [] });
    expect(response.status).toBe(400);
  });

  it("drops duplicate rows and reports how many it dropped", async () => {
    seedDocument();
    const response = await importRows({
      documentId: "doc-1",
      settings,
      rows: [mcqRow, { ...mcqRow, question: "which  ORGANELLE produces atp" }, identificationRow],
    });

    await expect(response.json()).resolves.toMatchObject({ questionCount: 2, duplicates: 1 });
  });
});
