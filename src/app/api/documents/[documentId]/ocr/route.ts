import { NextResponse } from "next/server";
import { adminDb, isAdminConfigured, uidFromAuthHeader } from "@/lib/firebase/admin";
import { logRouteError } from "@/lib/log";
import { MAX_CHARS_PER_PAGE_DOC, MAX_FILE_BYTES, formatBytes } from "@/lib/documents-shared";
import {
  MAX_OCR_PAGES_PER_DAY,
  MAX_OCR_PAGES_PER_DOCUMENT,
  ocrDocumentTooLongMessage,
  ocrQuotaExceededMessage,
} from "@/lib/generation/limits";
import { bumpUsage, readUsage } from "@/lib/usage";
import {
  extractPageImage,
  isOcrConfigured,
  openPdf,
  transcribePage,
  VisionUnavailable,
  type OcrEvent,
} from "@/lib/ocr";

/** pdf.js needs the Node runtime, not the edge one. */
export const runtime = "nodejs";
/**
 * Long by design: a page is a model round-trip, and the cap is 60 of them.
 * Render runs a persistent process so this is a ceiling rather than a promise,
 * but it must not be the 60s the ingest route uses.
 */
export const maxDuration = 800;

/**
 * Reads a scanned PDF's handwriting into page text (§3.3).
 *
 * The file comes back up with the request rather than being fetched from
 * storage, because this app deliberately keeps no copy of the original — the
 * ingest route extracts text and discards the bytes. The browser still has the
 * file the user just picked, so re-sending it costs a second upload and keeps
 * the no-Storage decision intact. Coming back to a half-read document later
 * means picking the file again, which the UI says plainly.
 *
 * Progress is streamed as NDJSON for the same reason generation is: forty
 * round-trips runs well past a spinner's welcome, and §7.7 asks for honest
 * progress rather than a fabricated percentage.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  if (!isAdminConfigured) {
    return fail(503, "The server isn't configured for uploads yet.");
  }
  if (!isOcrConfigured()) {
    return fail(503, "Reading handwriting isn't set up on this server.");
  }

  const uid = await uidFromAuthHeader(request.headers.get("authorization"));
  if (!uid) return fail(401, "Please sign in again and retry.");

  const { documentId } = await params;

  // The Admin SDK bypasses rules, so ownership is checked here explicitly.
  const docRef = adminDb().collection("documents").doc(documentId);
  const snapshot = await docRef.get();
  const document = snapshot.data();
  if (!snapshot.exists || !document || document.ownerId !== uid) {
    return fail(404, "We couldn't find that document.");
  }
  if (document.fileType !== "pdf") {
    return fail(400, "Only PDFs can be read this way.");
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
  } catch {
    return fail(400, "That upload didn't come through. Please try again.");
  }
  if (!file) return fail(400, "No file was included in the request.");
  if (file.size > MAX_FILE_BYTES) {
    return fail(413, `That file is ${formatBytes(file.size)}, which is over the limit.`);
  }

  const storedPageCount = Number(document.pageCount) || 0;
  if (storedPageCount > MAX_OCR_PAGES_PER_DOCUMENT) {
    return fail(413, ocrDocumentTooLongMessage(storedPageCount));
  }

  const { ocrPages: spentToday } = await readUsage(uid);
  const remaining = MAX_OCR_PAGES_PER_DAY - spentToday;
  if (remaining < storedPageCount) {
    return fail(429, ocrQuotaExceededMessage(Math.max(0, remaining)));
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return fail(400, "That upload didn't come through. Please try again.");
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: OcrEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        const pdf = await openPdf(bytes);
        if (pdf.numPages !== storedPageCount) {
          throw new OcrFailed(
            "That's a different file from the one you uploaded. Pick the same PDF and try again.",
          );
        }

        /*
         * Only the pages that came back empty. A PDF of typed pages with a few
         * scanned inserts pays for the inserts alone, which falls out of the
         * emptyPages list ingest already stored.
         */
        const targets: number[] = Array.isArray(document.emptyPages)
          ? (document.emptyPages as number[]).filter(
              (page) => Number.isInteger(page) && page >= 1 && page <= storedPageCount,
            )
          : [];
        const pages = targets.length > 0 ? targets : rangeOf(storedPageCount);

        const done: number[] = [];
        const skipped: number[] = [];
        let characters = 0;
        let model: string | null = null;
        let unreadableRun = 0;

        for (const [index, page] of pages.entries()) {
          send({
            type: "progress",
            message: `Reading page ${page} of ${storedPageCount}…`,
            completed: index,
            total: pages.length,
            characters,
          });

          const image = await extractPageImage(pdf, page);
          if (!image) {
            skipped.push(page);
            unreadableRun += 1;
            // Every page failing to yield an image means the PDF stores its
            // pages in a form we can't unpack — say so once rather than
            // grinding through forty identical failures.
            if (unreadableRun >= 3 && done.length === 0) {
              throw new OcrFailed(
                "We couldn't get a readable image out of this PDF's pages. It may have been made in a way we can't unpack — try re-exporting or re-scanning it.",
              );
            }
            continue;
          }
          unreadableRun = 0;

          const result = await transcribePage(image, { signal: request.signal });
          if (!result.text) {
            // A blank page returns empty rather than inventing text, so this is
            // "nothing written here", not a failure.
            skipped.push(page);
            continue;
          }

          model = result.model;
          const text = result.text.slice(0, MAX_CHARS_PER_PAGE_DOC);
          await docRef.collection("pages").doc(String(page)).set({ page, text });
          done.push(page);
          characters += text.length;
        }

        if (done.length === 0) {
          throw new OcrFailed(
            "We couldn't read any handwriting from this file. The pages may be blank, or too faint to make out.",
          );
        }

        await docRef.update({
          status: "ready",
          characterCount: characters,
          emptyPages: skipped,
          ocrPages: done,
          ocrModel: model,
        });
        await bumpUsage(uid, "ocrPages", done.length + skipped.length);

        send({ type: "done", pages: done, skipped, characters, model });
      } catch (error) {
        if (error instanceof OcrFailed) {
          send({ type: "error", message: error.message });
        } else if (error instanceof VisionUnavailable) {
          send({
            type: "error",
            message:
              "The free models are busy right now, so we couldn't finish reading this. Try again in a few minutes.",
          });
        } else if (error instanceof DOMException && error.name === "AbortError") {
          // The user navigated away or cancelled; pages already written stay.
        } else {
          logRouteError("documents.ocr", error, { uid, documentId });
          send({ type: "error", message: "Something went wrong reading that file." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

class OcrFailed extends Error {}

function rangeOf(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index + 1);
}

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}
