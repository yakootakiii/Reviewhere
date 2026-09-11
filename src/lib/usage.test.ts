import { beforeEach, describe, expect, it, vi } from "vitest";
import { usageDayKey } from "@/lib/generation/limits";

/** One in-memory usage document, which is all these counters ever touch. */
const store = { data: undefined as Record<string, unknown> | undefined };

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    collection: () => ({
      doc: () => ({ get: async () => ({ data: () => store.data }) }),
    }),
    runTransaction: async (
      run: (t: {
        get: () => Promise<{ data: () => Record<string, unknown> | undefined }>;
        set: (ref: unknown, data: Record<string, unknown>) => void;
      }) => Promise<void>,
    ) => {
      await run({
        get: async () => ({ data: () => store.data }),
        set: (_ref, data) => {
          store.data = data;
        },
      });
    },
  }),
}));

const { readUsage, bumpUsage } = await import("./usage");

beforeEach(() => {
  store.data = undefined;
});

describe("usage counters", () => {
  it("starts both counters at zero", async () => {
    await expect(readUsage("user-1")).resolves.toEqual({ modeACount: 0, ocrPages: 0 });
  });

  it("counts up from nothing", async () => {
    await bumpUsage("user-1", "modeACount");
    await expect(readUsage("user-1")).resolves.toMatchObject({ modeACount: 1 });
  });

  it("adds more than one at a time, for a document's worth of pages", async () => {
    await bumpUsage("user-1", "ocrPages", 12);
    await bumpUsage("user-1", "ocrPages", 3);
    await expect(readUsage("user-1")).resolves.toMatchObject({ ocrPages: 15 });
  });

  /*
   * The reason this module exists. Both counters share one document, and the
   * old recorder wrote `{ day, modeACount }` wholesale — so generating a quiz
   * silently reset the OCR count, handing back a day's quota for free.
   */
  it("does not reset the other counter when one is bumped", async () => {
    await bumpUsage("user-1", "ocrPages", 40);
    await bumpUsage("user-1", "modeACount");

    await expect(readUsage("user-1")).resolves.toEqual({ modeACount: 1, ocrPages: 40 });
  });

  it("treats counters from an earlier day as spent, not carried", async () => {
    store.data = { day: "2000-01-01", modeACount: 9, ocrPages: 99 };
    await expect(readUsage("user-1")).resolves.toEqual({ modeACount: 0, ocrPages: 0 });

    // And the first bump of the new day starts from zero, not from yesterday.
    await bumpUsage("user-1", "ocrPages", 2);
    expect(store.data).toEqual({ day: usageDayKey(), modeACount: 0, ocrPages: 2 });
  });

  it("ignores a malformed counter rather than producing NaN", async () => {
    store.data = { day: usageDayKey(), modeACount: "lots", ocrPages: null };
    await expect(readUsage("user-1")).resolves.toEqual({ modeACount: 0, ocrPages: 0 });
  });
});
