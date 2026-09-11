import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeScannedPdf, solidPixels } from "@/lib/extraction/fixtures";
import { MAX_OCR_PAGES_PER_DAY, MAX_OCR_PAGES_PER_DOCUMENT } from "@/lib/generation/limits";
import type { OcrEvent } from "@/lib/ocr/types";

const state = {
  configured: true,
  uid: "user-123" as string | null,
  document: undefined as Record<string, unknown> | undefined,
  pages: [] as { page: number; text: string }[],
  updates: [] as Record<string, unknown>[],
  usage: { modeACount: 0, ocrPages: 0 },
  bumped: [] as { field: string; amount: number }[],
};

vi.mock("@/lib/firebase/admin", () => ({
  get isAdminConfigured() {
    return state.configured;
  },
  uidFromAuthHeader: async () => state.uid,
  adminDb: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: state.document !== undefined, data: () => state.document }),
        update: async (data: Record<string, unknown>) => {
          state.updates.push(data);
        },
        collection: () => ({
          doc: (id: string) => ({
            set: async (data: { page: number; text: string }) => {
              state.pages.push({ ...data, page: Number(id) });
            },
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/usage", () => ({
  readUsage: async () => state.usage,
  bumpUsage: async (_uid: string, field: string, amount = 1) => {
    state.bumped.push({ field, amount });
  },
}));

/** The model is the one thing not exercised for real here. */
const transcribePage = vi.fn();
vi.mock("@/lib/ocr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ocr")>();
  return { ...actual, transcribePage: (...args: unknown[]) => transcribePage(...args) };
});

const { POST } = await import("./route");

function scannedPdf(pages: number) {
  return makeScannedPdf(
    Array.from({ length: pages }, () => ({
      pixels: solidPixels(300, 300, [220, 220, 220]),
      width: 300,
      height: 300,
    })),
  );
}

async function run(bytes: Uint8Array, auth = "Bearer token") {
  const body = new FormData();
  body.append("file", new File([bytes as BlobPart], "notes.pdf", { type: "application/pdf" }));
  const response = await POST(
    new Request("http://localhost/api/documents/doc-1/ocr", {
      method: "POST",
      body,
      headers: { authorization: auth },
    }),
    { params: Promise.resolve({ documentId: "doc-1" }) },
  );
  return response;
}

/** Collects the NDJSON event stream a successful run produces. */
async function events(response: Response): Promise<OcrEvent[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as OcrEvent);
}

beforeEach(() => {
  state.configured = true;
  state.uid = "user-123";
  state.document = { ownerId: "user-123", fileType: "pdf", pageCount: 2, emptyPages: [1, 2] };
  state.pages = [];
  state.updates = [];
  state.usage = { modeACount: 0, ocrPages: 0 };
  state.bumped = [];
  transcribePage.mockReset();
  transcribePage.mockResolvedValue({ text: "Glycolysis in the cytoplasm", model: "test/model" });
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
});

describe("POST /api/documents/[documentId]/ocr", () => {
  it("rejects an unauthenticated caller", async () => {
    state.uid = null;
    expect((await run(scannedPdf(2))).status).toBe(401);
    expect(state.pages).toHaveLength(0);
  });

  it("refuses a document owned by someone else", async () => {
    // The Admin SDK bypasses rules, so this check is the boundary here.
    state.document = { ownerId: "someone-else", fileType: "pdf", pageCount: 2 };
    expect((await run(scannedPdf(2))).status).toBe(404);
    expect(state.pages).toHaveLength(0);
  });

  it("refuses a .pptx, which has no page image to read", async () => {
    state.document = { ownerId: "user-123", fileType: "pptx", pageCount: 2 };
    expect((await run(scannedPdf(2))).status).toBe(400);
  });

  it("says so plainly when there's no key to read with", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect((await run(scannedPdf(2))).status).toBe(503);
  });

  it("refuses a document longer than the per-document cap", async () => {
    state.document = {
      ownerId: "user-123",
      fileType: "pdf",
      pageCount: MAX_OCR_PAGES_PER_DOCUMENT + 1,
    };
    const response = await run(scannedPdf(2));
    expect(response.status).toBe(413);
    expect(transcribePage).not.toHaveBeenCalled();
  });

  it("refuses when the day's remaining pages won't cover the document", async () => {
    state.usage = { modeACount: 0, ocrPages: MAX_OCR_PAGES_PER_DAY - 1 };
    const response = await run(scannedPdf(2));
    expect(response.status).toBe(429);
    expect(transcribePage).not.toHaveBeenCalled();
  });

  it("transcribes each empty page and stores the text as ordinary page text", async () => {
    const stream = await events(await run(scannedPdf(2)));

    expect(transcribePage).toHaveBeenCalledTimes(2);
    expect(state.pages).toEqual([
      { page: 1, text: "Glycolysis in the cytoplasm" },
      { page: 2, text: "Glycolysis in the cytoplasm" },
    ]);

    const done = stream.at(-1);
    expect(done).toMatchObject({ type: "done", pages: [1, 2], skipped: [] });
    // Ready means generation can now read it like any other document.
    expect(state.updates[0]).toMatchObject({ status: "ready", ocrPages: [1, 2] });
    expect(state.bumped).toEqual([{ field: "ocrPages", amount: 2 }]);
  });

  it("streams progress before the result, so the UI isn't guessing", async () => {
    const stream = await events(await run(scannedPdf(2)));
    const progress = stream.filter((event) => event.type === "progress");
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[0]).toMatchObject({ completed: 0, total: 2 });
  });

  it("treats a blank page as skipped rather than as a failure", async () => {
    transcribePage
      .mockResolvedValueOnce({ text: "", model: "test/model" })
      .mockResolvedValueOnce({ text: "Krebs cycle", model: "test/model" });

    const stream = await events(await run(scannedPdf(2)));
    expect(stream.at(-1)).toMatchObject({ type: "done", pages: [2], skipped: [1] });
    expect(state.pages).toEqual([{ page: 2, text: "Krebs cycle" }]);
  });

  it("errors rather than finishing empty when no page yielded text", async () => {
    transcribePage.mockResolvedValue({ text: "", model: "test/model" });
    const stream = await events(await run(scannedPdf(2)));

    expect(stream.at(-1)).toMatchObject({ type: "error" });
    // Nothing was written, so the document stays "processing" and retryable.
    expect(state.updates).toHaveLength(0);
    expect(state.bumped).toHaveLength(0);
  });

  it("rejects a different file from the one that was uploaded", async () => {
    state.document = { ownerId: "user-123", fileType: "pdf", pageCount: 5, emptyPages: [] };
    const stream = await events(await run(scannedPdf(2)));

    expect(stream.at(-1)).toMatchObject({
      type: "error",
      message: expect.stringContaining("different file"),
    });
    expect(transcribePage).not.toHaveBeenCalled();
  });

  it("only reads the pages that had no text, not the whole document", async () => {
    // A mixed PDF: page 1 typed, page 2 a scanned insert.
    state.document = { ownerId: "user-123", fileType: "pdf", pageCount: 2, emptyPages: [2] };
    await events(await run(scannedPdf(2)));

    expect(transcribePage).toHaveBeenCalledTimes(1);
    expect(state.pages).toEqual([{ page: 2, text: "Glycolysis in the cytoplasm" }]);
  });
});
