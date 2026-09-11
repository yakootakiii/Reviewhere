import { describe, expect, it } from "vitest";
import { makePdf, makeScannedPdf, solidPixels } from "@/lib/extraction/fixtures";
import { extractPdf } from "@/lib/extraction/pdf";
import { looksLikeScan } from "@/lib/extraction";
import { extractPageImage, openPdf } from "./page-images";

/**
 * Real PDF bytes, not mocks — the point of these is that the image survives
 * pdf.js's actual decoder, which is exactly what a stub could never prove.
 *
 * Note each test builds its own bytes: pdf.js transfers the buffer it is given,
 * so a shared fixture would be detached by whichever test parsed it first.
 */

const scan = (width: number, height: number, rgb: [number, number, number] = [200, 30, 40]) =>
  makeScannedPdf([{ pixels: solidPixels(width, height, rgb), width, height }]);

describe("extractPageImage", () => {
  it("recovers a scanned page's image with its pixels intact", async () => {
    const pdf = await openPdf(scan(300, 300, [200, 30, 40]));
    const image = await extractPageImage(pdf, 1);

    expect(image).not.toBeNull();
    expect(image!.width).toBe(300);
    expect(image!.height).toBe(300);
    expect(image!.channels).toBe(3);
    expect([image!.data[0], image!.data[1], image!.data[2]]).toEqual([200, 30, 40]);
  });

  it("is reached by the path a real scan takes: no text, so it looks like one", async () => {
    const extracted = await extractPdf(scan(300, 300));
    expect(extracted.characterCount).toBe(0);
    expect(extracted.pageCount).toBe(1);
    expect(looksLikeScan(extracted)).toBe(true);
  });

  it("returns null for a text page with no image on it", async () => {
    const pdf = await openPdf(makePdf(["Ordinary typed text, nothing to transcribe."]));
    expect(await extractPageImage(pdf, 1)).toBeNull();
  });

  it("ignores an image too small to be a page of notes", async () => {
    // A logo-sized mark, below the useful-pixels floor.
    const pdf = await openPdf(scan(64, 64));
    expect(await extractPageImage(pdf, 1)).toBeNull();
  });

  it("handles each page of a multi-page scan independently", async () => {
    const bytes = makeScannedPdf([
      { pixels: solidPixels(250, 250, [10, 10, 10]), width: 250, height: 250 },
      { pixels: solidPixels(250, 250, [240, 240, 240]), width: 250, height: 250 },
    ]);
    const pdf = await openPdf(bytes);

    const first = await extractPageImage(pdf, 1);
    const second = await extractPageImage(pdf, 2);
    expect(first!.data[0]).toBe(10);
    expect(second!.data[0]).toBe(240);
  });

  it("returns null rather than throwing when a page cannot be decoded", async () => {
    const pdf = await openPdf(scan(300, 300));
    // Page 9 does not exist; an unreadable page must not take the document down.
    expect(await extractPageImage(pdf, 9)).toBeNull();
  });
});
