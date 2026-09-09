import { describe, expect, it } from "vitest";
import { describeScope, normalizeSettings, resolveCounts } from "./settings";
import { buildModeBPrompt } from "./prompt";
import { CSV_HEADER } from "./csv-import";
import { GenerationError } from "./types";
import type { ExtractedPage } from "@/lib/extraction/types";

describe("resolveCounts", () => {
  it("splits the total on the requested mix", () => {
    expect(resolveCounts(20, 60)).toEqual({ mcq: 12, identification: 8 });
  });

  it("always adds back up to the total the user asked for", () => {
    for (const count of [5, 7, 13, 20, 33, 60]) {
      for (const pct of [0, 10, 33, 50, 60, 90, 100]) {
        const { mcq, identification } = resolveCounts(count, pct);
        expect(mcq + identification).toBe(count);
      }
    }
  });

  it("handles the all-one-type ends of the slider", () => {
    expect(resolveCounts(10, 0)).toEqual({ mcq: 0, identification: 10 });
    expect(resolveCounts(10, 100)).toEqual({ mcq: 10, identification: 0 });
  });
});

describe("normalizeSettings", () => {
  const base = { questionCount: 20, mcqPct: 60, difficulty: "mixed" as const, scope: null };

  it("accepts sane settings unchanged", () => {
    expect(normalizeSettings(base, 40)).toEqual(base);
  });

  it("rejects a question count outside the supported range", () => {
    expect(() => normalizeSettings({ ...base, questionCount: 2 }, 40)).toThrowError(/between 5 and 60/);
    expect(() => normalizeSettings({ ...base, questionCount: 500 }, 40)).toThrowError(GenerationError);
  });

  it("rejects a page range past the document's real page count", () => {
    expect(() => normalizeSettings({ ...base, scope: { from: 1, to: 90 } }, 40)).toThrowError(
      /has 40 pages/,
    );
  });

  it("rejects a backwards range in plain language", () => {
    expect(() => normalizeSettings({ ...base, scope: { from: 9, to: 4 } }, 40)).toThrowError(
      /starts after it ends/,
    );
  });

  it("treats a range covering the whole document as no range at all", () => {
    expect(normalizeSettings({ ...base, scope: { from: 1, to: 40 } }, 40).scope).toBeNull();
  });
});

describe("describeScope", () => {
  it("reads naturally for slides and single pages", () => {
    expect(describeScope(null)).toBe("Whole document");
    expect(describeScope({ from: 4, to: 4 })).toBe("Page 4");
    expect(describeScope({ from: 4, to: 9 }, "slides")).toBe("Slides 4–9");
  });
});

describe("buildModeBPrompt", () => {
  const pages: ExtractedPage[] = Array.from({ length: 6 }, (_, index) => ({
    page: index + 1,
    text: `Content for page ${index + 1}. `.padEnd(400, "x"),
  }));
  const document = { fileName: "Biology Week 3.pdf", pageCount: 6 };
  const settings = { questionCount: 20, mcqPct: 60, difficulty: "hard" as const, scope: null };

  it("embeds the exact CSV contract, the settings, and the document text", () => {
    const { prompt } = buildModeBPrompt(pages, settings, document);

    expect(prompt).toContain(CSV_HEADER.join(","));
    expect(prompt).toContain("12 multiple choice");
    expect(prompt).toContain("8 identification");
    expect(prompt).toContain("Biology Week 3.pdf");
    expect(prompt).toContain("--- Page 1 ---");
    expect(prompt).toContain("Content for page 6.");
    expect(prompt).toMatch(/RFC 4180/);
  });

  it("embeds only the scoped pages", () => {
    const { prompt } = buildModeBPrompt(pages, { ...settings, scope: { from: 2, to: 3 } }, document);
    expect(prompt).toContain("--- Page 2 ---");
    expect(prompt).toContain("--- Page 3 ---");
    expect(prompt).not.toContain("--- Page 5 ---");
  });

  it("reports truncation rather than silently cutting the material", () => {
    const result = buildModeBPrompt(pages, settings, document, 900);
    expect(result.truncated).toBe(true);
    expect(result.includedTo).toBeLessThan(6);
  });
});
