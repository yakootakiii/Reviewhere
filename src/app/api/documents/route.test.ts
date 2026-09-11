import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePdf, makePptx } from "@/lib/extraction/fixtures";
import { MAX_PAGES } from "@/lib/types";

const state = {
  configured: true,
  uid: "user-123" as string | null,
  written: [] as { path: string; data: Record<string, unknown> }[],
};

vi.mock("@/lib/firebase/admin", () => ({
  get isAdminConfigured() {
    return state.configured;
  },
  uidFromAuthHeader: async () => state.uid,
  adminDb: () => ({
    collection: (name: string) => ({
      doc: (id?: string) => makeDoc(`${name}/${id ?? "generated-id"}`),
    }),
    batch: () => {
      const queued: typeof state.written = [];
      return {
        set: (ref: { path: string }, data: Record<string, unknown>) =>
          queued.push({ path: ref.path, data }),
        commit: async () => state.written.push(...queued),
      };
    },
  }),
}));

function makeDoc(path: string) {
  return {
    id: path.split("/").pop()!,
    path,
    set: async (data: Record<string, unknown>) => {
      state.written.push({ path, data });
    },
    collection: (name: string) => ({
      doc: (id: string) => makeDoc(`${path}/${name}/${id}`),
    }),
  };
}

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "SERVER_TIMESTAMP" },
}));

const { POST } = await import("./route");

function upload(file: File, auth = "Bearer token") {
  const body = new FormData();
  body.append("file", file);
  return POST(new Request("http://localhost/api/documents", { method: "POST", body, headers: { authorization: auth } }));
}

function pdfFile(pageTexts: string[], name = "notes.pdf") {
  return new File([makePdf(pageTexts) as BlobPart], name, { type: "application/pdf" });
}

beforeEach(() => {
  state.configured = true;
  state.uid = "user-123";
  state.written = [];
  // Whether OCR is on hand changes what a scan does, so no test inherits
  // another's stub — or the ambient environment's key.
  vi.unstubAllEnvs();
});

describe("POST /api/documents", () => {
  it("rejects an unauthenticated caller", async () => {
    state.uid = null;
    const response = await upload(pdfFile(["Some text on a page"]));
    expect(response.status).toBe(401);
    expect(state.written).toHaveLength(0);
  });

  it("reports a clear message when the server has no credentials", async () => {
    state.configured = false;
    const response = await upload(pdfFile(["Some text on a page"]));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("FIREBASE_SERVICE_ACCOUNT"),
    });
  });

  it("rejects unsupported file types", async () => {
    const response = await upload(
      new File(["hello"], "notes.docx", { type: "application/msword" }),
    );
    expect(response.status).toBe(415);
    expect(state.written).toHaveLength(0);
  });

  /*
   * §3.3 split this in two. A scan is only a rejection when nothing can be done
   * about it; with a key and a PDF it becomes an offer instead. The env is
   * stubbed explicitly in both, because leaving it to whatever the test
   * environment happens to hold made the old test pass for the wrong reason.
   */
  it("rejects a scanned document when there's no key to read it with", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const response = await upload(pdfFile(["", "", ""]));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("scan"),
    });
    expect(state.written).toHaveLength(0);
  });

  it("rejects a scanned .pptx even with a key, since it has no page images", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const empty = await makePptx([{ text: [] }, { text: [] }]);
    const response = await upload(
      new File([empty as BlobPart], "deck.pptx", {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
    );
    expect(response.status).toBe(422);
    expect(state.written).toHaveLength(0);
  });

  it("keeps a scanned PDF and offers to read it when OCR is available", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const response = await upload(pdfFile(["", "", ""]));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ needsOcr: true, pageCount: 3 });

    // The document is real and waiting, never lost to the library.
    const document = state.written.find((entry) => entry.path.startsWith("documents/"));
    expect(document?.data.status).toBe("processing");
    expect(document?.data.emptyPages).toEqual([1, 2, 3]);
  });

  it("enforces the 150-page cap on its own page count, not the client's", async () => {
    const pages = Array.from({ length: MAX_PAGES + 5 }, (_, i) => `Page ${i + 1} content here`);
    const response = await upload(pdfFile(pages));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining(`This file has ${MAX_PAGES + 5} pages`),
    });
    // Nothing is persisted for an over-limit document.
    expect(state.written).toHaveLength(0);
  });

  it("stores the document plus one subdocument per page", async () => {
    const response = await upload(pdfFile(["Mitochondria make ATP", "Ribosomes build proteins"]));
    expect(response.status).toBe(200);

    await expect(response.json()).resolves.toMatchObject({
      pageCount: 2,
      fileType: "pdf",
      fileName: "notes.pdf",
    });

    const parent = state.written.find((entry) => entry.path === "documents/generated-id");
    expect(parent?.data).toMatchObject({
      ownerId: "user-123",
      pageCount: 2,
      status: "ready",
      // Text-only configuration: no Storage object is written.
      storagePath: null,
    });

    const pages = state.written.filter((entry) => entry.path.includes("/pages/"));
    expect(pages).toHaveLength(2);
    expect(pages[0].data.text).toContain("Mitochondria");
  });

  it("handles a pptx, keeping slide numbering", async () => {
    const bytes = await makePptx([{ text: ["Cell Biology"] }, { text: ["The Krebs cycle"] }]);
    const file = new File([bytes as BlobPart], "lecture.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    const response = await upload(file);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ pageCount: 2, fileType: "pptx" });
  });
});
