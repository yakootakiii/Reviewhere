import { describe, expect, it } from "vitest";
import {
  assertHasText,
  assertWithinPageLimit,
  extractPdf,
  extractPptx,
  ExtractionError,
  fileTypeFor,
} from "./index";
import { makePdf, makePptx } from "./fixtures";
import { MAX_PAGES } from "@/lib/types";

describe("fileTypeFor", () => {
  it("recognises the accepted MIME types", () => {
    expect(fileTypeFor("notes.pdf", "application/pdf")).toBe("pdf");
    expect(
      fileTypeFor(
        "deck.pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
    ).toBe("pptx");
  });

  it("falls back to the extension when the browser reports no MIME type", () => {
    expect(fileTypeFor("notes.pdf", "")).toBe("pdf");
    expect(fileTypeFor("DECK.PPTX", "application/octet-stream")).toBe("pptx");
  });

  it("rejects everything else, including the legacy .ppt format", () => {
    expect(fileTypeFor("notes.docx", "application/msword")).toBeNull();
    expect(fileTypeFor("deck.ppt", "application/vnd.ms-powerpoint")).toBeNull();
    expect(fileTypeFor("notes.txt", "text/plain")).toBeNull();
  });
});

describe("assertWithinPageLimit", () => {
  it("accepts a document exactly at the limit", () => {
    expect(() => assertWithinPageLimit(MAX_PAGES)).not.toThrow();
  });

  it("rejects one page over, quoting the real count back to the user", () => {
    expect(() => assertWithinPageLimit(187)).toThrowError(
      /This file has 187 pages\. Trim it to 150 pages or fewer/,
    );
    expect(() => assertWithinPageLimit(MAX_PAGES + 1)).toThrow(ExtractionError);
  });

  it("rejects an empty document", () => {
    expect(() => assertWithinPageLimit(0)).toThrowError(/empty/i);
  });
});

describe("assertHasText", () => {
  const base = { pages: [], emptyPages: [], characterCount: 0, pageCount: 10 };

  it("rejects a document with no extractable text at all", () => {
    expect(() => assertHasText(base)).toThrowError(/scan or a set of images/);
  });

  it("rejects a document where nearly every page is blank", () => {
    expect(() =>
      assertHasText({
        ...base,
        characterCount: 30,
        emptyPages: Array.from({ length: 10 }, (_, i) => i + 1),
      }),
    ).toThrow(ExtractionError);
  });

  it("accepts a document with a few blank pages", () => {
    expect(() =>
      assertHasText({ ...base, characterCount: 5000, emptyPages: [3, 7] }),
    ).not.toThrow();
  });

  it("accepts a terse slide deck whose every slide is under the empty threshold", () => {
    // Titles like "Cell Biology" are short enough to look blank page-by-page,
    // but the deck is perfectly readable and must not be called a scan.
    expect(() =>
      assertHasText({
        ...base,
        pageCount: 3,
        characterCount: 42,
        emptyPages: [1, 2, 3],
      }),
    ).not.toThrow();
  });
});

describe("extractPdf", () => {
  it("returns one entry per page, numbered from 1", async () => {
    const result = await extractPdf(
      makePdf(["Mitochondria are the powerhouse", "Glycolysis happens in the cytosol"]),
    );

    expect(result.pageCount).toBe(2);
    expect(result.pages.map((page) => page.page)).toEqual([1, 2]);
    expect(result.pages[0].text).toContain("Mitochondria");
    expect(result.pages[1].text).toContain("Glycolysis");
    expect(result.characterCount).toBeGreaterThan(0);
  });

  it("flags pages with no meaningful text as candidates for OCR", async () => {
    const result = await extractPdf(makePdf(["A page with plenty of readable text on it", ""]));
    expect(result.emptyPages).toContain(2);
    expect(result.emptyPages).not.toContain(1);
  });

  it("surfaces a friendly error rather than a parser stack trace", async () => {
    await expect(extractPdf(new TextEncoder().encode("this is not a pdf"))).rejects.toThrow(
      ExtractionError,
    );
  });
});

describe("extractPptx", () => {
  it("extracts every text run on each slide", async () => {
    const result = await extractPptx(
      await makePptx([
        { text: ["Cell Biology", "Chapter 4"] },
        { text: ["The Krebs cycle"] },
      ]),
    );

    expect(result.pageCount).toBe(2);
    expect(result.pages[0].text).toContain("Cell Biology");
    expect(result.pages[0].text).toContain("Chapter 4");
    expect(result.pages[1].text).toContain("Krebs");
  });

  it("includes speaker notes, where lecturers put the real explanation", async () => {
    const result = await extractPptx(
      await makePptx([{ text: ["Photosynthesis"], notes: ["Occurs in the chloroplast"] }]),
    );

    expect(result.pages[0].text).toContain("Photosynthesis");
    expect(result.pages[0].text).toContain("Occurs in the chloroplast");
  });

  it("renumbers slides sequentially when the deck has gaps", async () => {
    // A deck edited down to slides 1 and 3 must still report pages 1 and 2,
    // so sourcePage matches what the student sees in the slide viewer.
    const zip = await makePptx([{ text: ["First"] }, { text: ["Second"] }]);
    const JSZip = (await import("jszip")).default;
    const archive = await JSZip.loadAsync(zip);
    archive.remove("ppt/slides/slide1.xml");
    archive.file(
      "ppt/slides/slide7.xml",
      `<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><a:t>Seventh</a:t></p:sld>`,
    );

    const result = await extractPptx(await archive.generateAsync({ type: "uint8array" }));
    expect(result.pages.map((page) => page.page)).toEqual([1, 2]);
    expect(result.pages[0].text).toContain("Second");
    expect(result.pages[1].text).toContain("Seventh");
  });

  it("rejects a zip with no slides, pointing at the .ppt case", async () => {
    const JSZip = (await import("jszip")).default;
    const empty = await new JSZip().generateAsync({ type: "uint8array" });
    await expect(extractPptx(empty)).rejects.toThrowError(/older \.ppt file/);
  });
});
