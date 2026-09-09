import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationEvent } from "@/lib/generation/types";
import { MAX_MODE_A_GENERATIONS_PER_DAY } from "@/lib/generation/limits";
import { DEFAULT_MODEL_CHAIN } from "@/lib/generation/openrouter";

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

const { GET, POST } = await import("./route");

const fetchMock = vi.fn();

const validQuestion = (index: number, type: "mcq" | "identification" = "mcq") =>
  type === "mcq"
    ? {
        type: "mcq",
        prompt: `Which organelle is number ${index}?`,
        choices: ["Ribosome", "Mitochondrion", "Nucleus", "Golgi"],
        correct_answer: "Mitochondrion",
        explanation: "Because it makes ATP.",
        source_page: 1,
      }
    : {
        type: "identification",
        prompt: `Name organelle number ${index}.`,
        correct_answer: "Mitochondrion",
        accepted_answers: ["mitochondria"],
        explanation: "Because it makes ATP.",
        source_page: 2,
      };

function modelReply(questions: unknown[]) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(questions) } }] }), {
    status: 200,
  });
}

function seedDocument(pageCount = 4, ownerId = "user-123") {
  fake.store.docs.set("documents/doc-1", {
    ownerId,
    fileName: "Biology Week 3.pdf",
    pageCount,
    fileType: "pdf",
    status: "ready",
  });
  for (let page = 1; page <= pageCount; page += 1) {
    fake.store.docs.set(`documents/doc-1/pages/${page}`, {
      page,
      text: `Page ${page}: mitochondria produce ATP. `.padEnd(1_500, "x"),
    });
  }
}

function generate(body: unknown, auth = "Bearer token") {
  return POST(
    new Request("http://localhost/api/quizzes/generate", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { authorization: auth, "content-type": "application/json" },
    }),
  );
}

async function readEvents(response: Response): Promise<GenerationEvent[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as GenerationEvent);
}

const settings = { questionCount: 10, mcqPct: 60, difficulty: "medium", scope: null };

beforeEach(() => {
  fake.store.reset();
  fake.uid = "user-123";
  fake.configured = true;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_MODEL", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/quizzes/generate", () => {
  it("reports Mode A as unavailable when there's no API key, so the UI can lead with Mode B", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    await expect((await GET()).json()).resolves.toMatchObject({ available: false });
  });

  it("reports the model at the head of the chain when configured", async () => {
    await expect((await GET()).json()).resolves.toEqual({
      available: true,
      model: DEFAULT_MODEL_CHAIN[0],
    });
  });
});

describe("POST /api/quizzes/generate", () => {
  it("rejects an unauthenticated caller", async () => {
    fake.uid = null;
    const response = await generate({ documentId: "doc-1", settings });
    expect(response.status).toBe(401);
  });

  it("refuses to generate from someone else's document", async () => {
    seedDocument(4, "someone-else");
    const response = await generate({ documentId: "doc-1", settings });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("couldn't find that document"),
    });
  });

  it("validates settings against the server's page count, not the client's claim", async () => {
    seedDocument(4);
    const response = await generate({
      documentId: "doc-1",
      settings: { ...settings, scope: { from: 1, to: 400 } },
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("has 4 pages"),
    });
  });

  it("offers Mode B rather than failing hard when no API key is configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    seedDocument();
    const response = await generate({ documentId: "doc-1", settings });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ offerModeB: true });
  });

  it("streams progress and writes the quiz plus one document per question", async () => {
    seedDocument();
    fetchMock.mockImplementation(async () =>
      modelReply([validQuestion(1), validQuestion(2, "identification"), validQuestion(3)]),
    );

    const response = await generate({ documentId: "doc-1", settings });
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");

    const events = await readEvents(response);
    expect(events.some((event) => event.type === "progress")).toBe(true);

    const done = events.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type !== "done") return;

    const quizPath = `quizzes/${done.quizId}`;
    expect(fake.store.docs.get(quizPath)).toMatchObject({
      ownerId: "user-123",
      documentId: "doc-1",
      title: "Biology Week 3",
      generationMode: "auto",
      questionCount: done.questionCount,
    });
    expect(fake.store.pathsUnder(`${quizPath}/questions/`)).toHaveLength(done.questionCount);
  });

  it("stores questions under zero-padded ids so id order is question order", async () => {
    seedDocument();
    fetchMock.mockImplementation(async () =>
      modelReply([validQuestion(1), validQuestion(2, "identification")]),
    );

    const events = await readEvents(await generate({ documentId: "doc-1", settings }));
    const done = events.at(-1);
    if (done?.type !== "done") throw new Error("expected a done event");

    const ids = fake.store
      .pathsUnder(`quizzes/${done.quizId}/questions/`)
      .map((path) => path.split("/").pop()!);
    expect(ids[0]).toBe("q001");
    expect([...ids].sort()).toEqual(ids);
  });

  it("deduplicates the repeats that overlapping chunks produce", async () => {
    seedDocument(20);
    // Every chunk returns the same two questions.
    fetchMock.mockImplementation(async () =>
      modelReply([validQuestion(1), validQuestion(2, "identification")]),
    );

    const events = await readEvents(await generate({ documentId: "doc-1", settings }));
    const done = events.at(-1);
    if (done?.type !== "done") throw new Error("expected a done event");
    expect(done.questionCount).toBe(2);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("saves a partial quiz when only some chunks come back usable", async () => {
    seedDocument(20);
    let call = 0;
    fetchMock.mockImplementation(async () => {
      call += 1;
      return call === 1 ? modelReply([validQuestion(1)]) : modelReply([]);
    });

    const events = await readEvents(await generate({ documentId: "doc-1", settings }));
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type !== "done") return;
    // Honest about coming up short rather than pretending it hit the target.
    expect(done.questionCount).toBeLessThan(done.requested);
  });

  it("offers Mode B and writes nothing when every chunk fails", async () => {
    seedDocument();
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ choices: [{ message: { content: "nope" } }] })),
    );

    const events = await readEvents(await generate({ documentId: "doc-1", settings }));
    const last = events.at(-1);
    expect(last).toMatchObject({ type: "error", offerModeB: true });
    expect(fake.store.pathsUnder("quizzes/")).toHaveLength(0);
    // The document is untouched — a failed generation never loses it.
    expect(fake.store.docs.has("documents/doc-1")).toBe(true);
  });

  it("counts each generation against the daily cap and offers Mode B once it's hit", async () => {
    seedDocument();
    fetchMock.mockImplementation(async () => modelReply([validQuestion(1)]));

    await readEvents(await generate({ documentId: "doc-1", settings }));
    expect(fake.store.docs.get("usage/user-123")).toMatchObject({ modeACount: 1 });

    fake.store.docs.set("usage/user-123", {
      day: new Date().toISOString().slice(0, 10),
      modeACount: MAX_MODE_A_GENERATIONS_PER_DAY,
    });

    const blocked = await generate({ documentId: "doc-1", settings });
    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toMatchObject({ offerModeB: true });
  });
});
