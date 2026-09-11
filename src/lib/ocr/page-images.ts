/**
 * Getting a picture of a scanned page out of a PDF.
 *
 * A PDF made by scanning is almost always one full-page raster image per page,
 * which `extractImages` hands over directly — no rasterising, so no canvas
 * dependency. That is the cheap path and it covers the scanner apps people
 * actually use.
 *
 * It is not universal: some producers tile a page into strips, and some encode
 * with JBIG2 or CCITT masks that pdf.js won't decode into plain pixels. Those
 * pages return null here rather than throwing, and the caller reports them as
 * unreadable. Rendering the page properly would need `@napi-rs/canvas`; that is
 * a deliberate not-yet, revisited if real files need it.
 */

import { extractImages, getDocumentProxy } from "unpdf";
import type { RawImage } from "./png";

/**
 * Smaller than this and it is a logo, a signature line or a scanning artefact,
 * not a page of notes. Measured against the page's largest image.
 */
const MIN_USEFUL_PIXELS = 200 * 200;

export type PdfProxy = Awaited<ReturnType<typeof getDocumentProxy>>;

/**
 * Note that pdf.js **transfers** the buffer it is handed, leaving the caller's
 * `Uint8Array` detached. Anything that needs the bytes afterwards must copy
 * them first — reusing the same array for a second parse fails with an opaque
 * "Unable to deserialize cloned data".
 */
export async function openPdf(bytes: Uint8Array): Promise<PdfProxy> {
  return getDocumentProxy(bytes);
}

/**
 * The largest image on a page, which for a scan is the scan itself. Returns
 * null when the page has no image big enough to be worth transcribing.
 */
export async function extractPageImage(
  pdf: PdfProxy,
  pageNumber: number,
): Promise<RawImage | null> {
  let images: Awaited<ReturnType<typeof extractImages>>;
  try {
    images = await extractImages(pdf, pageNumber);
  } catch {
    // A page whose images pdf.js cannot decode is unreadable, not fatal: the
    // rest of the document still transcribes.
    return null;
  }

  let best: RawImage | null = null;
  for (const image of images) {
    if (image.channels !== 1 && image.channels !== 3 && image.channels !== 4) continue;
    const candidate: RawImage = {
      data: image.data,
      width: image.width,
      height: image.height,
      channels: image.channels,
    };
    if (!best || area(candidate) > area(best)) best = candidate;
  }

  if (!best || area(best) < MIN_USEFUL_PIXELS) return null;
  return best;
}

function area(image: RawImage): number {
  return image.width * image.height;
}
