import { describe, expect, it } from "vitest";
import { assignQuotas, buildChunks, chunkPages, sampleEvenly, selectPages } from "./chunking";
import type { ExtractedPage } from "@/lib/extraction/types";

function pages(count: number, charsPerPage = 500): ExtractedPage[] {
  return Array.from({ length: count }, (_, index) => ({
    page: index + 1,
    text: `Page ${index + 1}. `.padEnd(charsPerPage, "x"),
  }));
}

describe("selectPages", () => {
  it("keeps only pages inside the scope, in page order", () => {
    const selected = selectPages(pages(10).reverse(), { from: 3, to: 5 });
    expect(selected.map((page) => page.page)).toEqual([3, 4, 5]);
  });

  it("skips pages the extractor left effectively blank", () => {
    const withBlank = [...pages(3), { page: 4, text: "  " }];
    expect(selectPages(withBlank, null).map((page) => page.page)).toEqual([1, 2, 3]);
  });
});

describe("chunkPages", () => {
  it("groups whole pages under the character budget", () => {
    const chunks = chunkPages(pages(10, 500), 1_200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThan(2_500);
  });

  it("never splits a page across two chunks", () => {
    const chunks = chunkPages(pages(9, 400), 900);
    const covered = chunks.flatMap((chunk) =>
      Array.from({ length: chunk.to - chunk.from + 1 }, (_, index) => chunk.from + index),
    );
    expect(covered).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("marks every page so a question can cite it", () => {
    const [chunk] = chunkPages(pages(2), 10_000);
    expect(chunk.text).toContain("--- Page 1 ---");
    expect(chunk.text).toContain("--- Page 2 ---");
    expect(chunk.from).toBe(1);
    expect(chunk.to).toBe(2);
  });
});

describe("sampleEvenly", () => {
  it("spreads the sample across the whole range rather than taking a prefix", () => {
    expect(sampleEvenly([1, 2, 3, 4, 5, 6, 7, 8], 4)).toEqual([1, 3, 5, 7]);
  });

  it("returns everything when it already fits", () => {
    expect(sampleEvenly([1, 2, 3], 8)).toEqual([1, 2, 3]);
  });
});

describe("assignQuotas", () => {
  it("distributes the total in proportion to chunk size and loses nothing to rounding", () => {
    const chunks = [
      { from: 1, to: 1, text: "x".repeat(3_000), quota: 0 },
      { from: 2, to: 2, text: "x".repeat(1_000), quota: 0 },
      { from: 3, to: 3, text: "x".repeat(1_000), quota: 0 },
    ];
    const quotas = assignQuotas(chunks, 20).map((chunk) => chunk.quota);

    expect(quotas.reduce((sum, value) => sum + value, 0)).toBe(20);
    expect(quotas[0]).toBeGreaterThan(quotas[1]);
  });

  it("still adds up when the total doesn't divide evenly", () => {
    const chunks = Array.from({ length: 3 }, (_, index) => ({
      from: index + 1,
      to: index + 1,
      text: "x".repeat(1_000),
      quota: 0,
    }));
    const total = assignQuotas(chunks, 10).reduce((sum, chunk) => sum + chunk.quota, 0);
    expect(total).toBe(10);
  });
});

describe("buildChunks", () => {
  it("caps the number of model calls for a long document", () => {
    const chunks = buildChunks(pages(150, 2_000), null, 30);
    expect(chunks.length).toBeLessThanOrEqual(8);
    expect(chunks.reduce((sum, chunk) => sum + chunk.quota, 0)).toBe(30);
  });

  it("honours a page range", () => {
    const chunks = buildChunks(pages(50, 2_000), { from: 10, to: 14 }, 10);
    expect(Math.min(...chunks.map((chunk) => chunk.from))).toBe(10);
    expect(Math.max(...chunks.map((chunk) => chunk.to))).toBe(14);
  });

  it("makes a few focused calls rather than many empty ones for a small quiz", () => {
    const chunks = buildChunks(pages(60, 3_000), null, 5);
    expect(chunks.length).toBeLessThanOrEqual(5);
    for (const chunk of chunks) expect(chunk.quota).toBeGreaterThan(0);
  });
});
