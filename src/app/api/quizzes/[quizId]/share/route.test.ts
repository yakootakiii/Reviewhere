import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = await vi.hoisted(async () => {
  const { createFakeFirestore } = await import("@/lib/firebase/firestore-fake");
  return {
    store: createFakeFirestore(),
    uid: "user-owner" as string | null,
    configured: true,
    // A stand-in for the Auth directory the route resolves emails against.
    accounts: [
      { uid: "user-owner", email: "owner@example.com", displayName: "Owner" },
      { uid: "user-friend", email: "friend@example.com", displayName: "Friend" },
    ] as { uid: string; email: string; displayName: string }[],
  };
});

vi.mock("@/lib/firebase/admin", () => ({
  get isAdminConfigured() {
    return fake.configured;
  },
  uidFromAuthHeader: async () => fake.uid,
  adminDb: () => fake.store.db,
  adminAuth: () => ({
    getUserByEmail: async (email: string) => {
      const found = fake.accounts.find((a) => a.email === email);
      if (!found) throw new Error("auth/user-not-found");
      return found;
    },
    getUser: async (uid: string) => fake.accounts.find((a) => a.uid === uid)!,
    getUsers: async (ids: { uid: string }[]) => ({
      users: ids
        .map(({ uid }) => fake.accounts.find((a) => a.uid === uid))
        .filter(Boolean),
    }),
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => "SERVER_TIMESTAMP",
    arrayUnion: (...values: unknown[]) => ({ __op: "arrayUnion", values }),
    arrayRemove: (...values: unknown[]) => ({ __op: "arrayRemove", values }),
  },
}));

const { GET, POST, DELETE } = await import("./route");

const params = Promise.resolve({ quizId: "quiz-1" });

function seedQuiz(ownerId = "user-owner", sharedWith?: string[]) {
  fake.store.docs.set("quizzes/quiz-1", {
    ownerId,
    documentId: "doc-1",
    title: "Biology Week 3",
    questionCount: 2,
    ...(sharedWith ? { sharedWith } : {}),
  });
}

const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api/quizzes/quiz-1/share", {
    method,
    headers: { authorization: "Bearer token", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const sharedWith = () =>
  (fake.store.docs.get("quizzes/quiz-1")?.sharedWith as string[] | undefined) ?? [];

beforeEach(() => {
  fake.store.reset();
  fake.uid = "user-owner";
  fake.configured = true;
});

describe("POST — sharing by email", () => {
  it("rejects an unauthenticated caller", async () => {
    fake.uid = null;
    seedQuiz();
    expect((await POST(req("POST", { email: "friend@example.com" }), { params })).status).toBe(401);
  });

  it("refuses to share a quiz you don't own", async () => {
    seedQuiz("someone-else");
    const response = await POST(req("POST", { email: "friend@example.com" }), { params });
    expect(response.status).toBe(404);
    expect(sharedWith()).toEqual([]);
  });

  it("records the recipient's uid, never their email", async () => {
    seedQuiz();
    const response = await POST(req("POST", { email: "friend@example.com" }), { params });

    expect(response.status).toBe(200);
    expect(sharedWith()).toEqual(["user-friend"]);
    // The array is readable by every recipient, so it must not carry addresses.
    expect(JSON.stringify(fake.store.docs.get("quizzes/quiz-1"))).not.toContain("@");
  });

  it("stamps the owner's name so a recipient knows who sent it", async () => {
    seedQuiz();
    await POST(req("POST", { email: "friend@example.com" }), { params });
    expect(fake.store.docs.get("quizzes/quiz-1")).toMatchObject({ ownerName: "Owner" });
  });

  it("says so plainly when no account uses that address", async () => {
    seedQuiz();
    const response = await POST(req("POST", { email: "nobody@example.com" }), { params });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("No Reviewhere account"),
    });
  });

  it("refuses to share with yourself", async () => {
    seedQuiz();
    const response = await POST(req("POST", { email: "owner@example.com" }), { params });
    expect(response.status).toBe(400);
    expect(sharedWith()).toEqual([]);
  });

  it("does not add the same person twice", async () => {
    seedQuiz("user-owner", ["user-friend"]);
    const response = await POST(req("POST", { email: "friend@example.com" }), { params });
    expect(response.status).toBe(409);
    expect(sharedWith()).toEqual(["user-friend"]);
  });

  it("enforces the recipient cap", async () => {
    const { MAX_SHARE_RECIPIENTS } = await import("@/lib/quiz-shared");
    seedQuiz(
      "user-owner",
      Array.from({ length: MAX_SHARE_RECIPIENTS }, (_, index) => `filler-${index}`),
    );
    const response = await POST(req("POST", { email: "friend@example.com" }), { params });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining(String(MAX_SHARE_RECIPIENTS)),
    });
  });

  it("rejects an empty address", async () => {
    seedQuiz();
    expect((await POST(req("POST", { email: "  " }), { params })).status).toBe(400);
  });
});

describe("GET — who it's shared with", () => {
  it("resolves uids to addresses for the owner", async () => {
    seedQuiz("user-owner", ["user-friend"]);
    const response = await GET(req("GET"), { params });
    await expect(response.json()).resolves.toEqual({
      recipients: [{ uid: "user-friend", email: "friend@example.com", displayName: "Friend" }],
    });
  });

  it("is owner-only — this is what stops recipients seeing each other", async () => {
    seedQuiz("someone-else", ["user-friend"]);
    expect((await GET(req("GET"), { params })).status).toBe(404);
  });

  it("returns an empty list for an unshared quiz", async () => {
    seedQuiz();
    await expect((await GET(req("GET"), { params })).json()).resolves.toEqual({ recipients: [] });
  });
});

describe("DELETE — revoking", () => {
  it("removes just that recipient", async () => {
    seedQuiz("user-owner", ["user-friend", "user-other"]);
    const response = await DELETE(req("DELETE", { uid: "user-friend" }), { params });

    expect(response.status).toBe(200);
    expect(sharedWith()).toEqual(["user-other"]);
  });

  it("refuses for someone who doesn't own the quiz", async () => {
    seedQuiz("someone-else", ["user-friend"]);
    expect((await DELETE(req("DELETE", { uid: "user-friend" }), { params })).status).toBe(404);
    expect(sharedWith()).toEqual(["user-friend"]);
  });
});
