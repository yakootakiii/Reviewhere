import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, isAdminConfigured, uidFromAuthHeader } from "@/lib/firebase/admin";
import { logRouteError } from "@/lib/log";
import {
  assertWithinPageLimit,
  extractDocument,
  ExtractionError,
  fileTypeFor,
  looksLikeScan,
  SCAN_REJECTION_MESSAGE,
} from "@/lib/extraction";
import { isOcrConfigured } from "@/lib/ocr";
import { MAX_CHARS_PER_PAGE_DOC, MAX_FILE_BYTES } from "@/lib/documents-shared";
import { formatBytes } from "@/lib/documents-shared";

/** pdf.js needs the Node runtime, not the edge one. */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Ingest endpoint. Extraction and the 150-page check happen here rather than in
 * the browser precisely so the page count is ours, not the client's (§2.1).
 */
export async function POST(request: Request) {
  if (!isAdminConfigured) {
    return fail(
      503,
      "The server isn't configured for uploads yet. Add FIREBASE_SERVICE_ACCOUNT to .env.local.",
    );
  }

  const uid = await uidFromAuthHeader(request.headers.get("authorization"));
  if (!uid) return fail(401, "Please sign in again and retry.");

  let file: File | null = null;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
  } catch {
    return fail(400, "That upload didn't come through. Please try again.");
  }

  if (!file) return fail(400, "No file was included in the upload.");

  if (file.size > MAX_FILE_BYTES) {
    return fail(
      413,
      `That file is ${formatBytes(file.size)}. Files need to be under ${formatBytes(MAX_FILE_BYTES)}.`,
    );
  }

  const fileType = fileTypeFor(file.name, file.type);
  if (!fileType) {
    return fail(415, "Reviewhere reads PDF and PowerPoint (.pptx) files. Try one of those.");
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractDocument(bytes, fileType);

    assertWithinPageLimit(extracted.pageCount);

    /*
     * A scan used to be the end of the road. It can now be offered to OCR
     * (§3.3) — but only for a PDF, since that is where a page image can be
     * recovered from, and only when the server has a key to read it with.
     * Everything else still gets the original copy explaining why.
     */
    const scanned = looksLikeScan(extracted);
    const canOcr = scanned && fileType === "pdf" && isOcrConfigured();
    if (scanned && !canOcr) throw new ExtractionError(SCAN_REJECTION_MESSAGE);

    const db = adminDb();
    const docRef = db.collection("documents").doc();

    await docRef.set({
      ownerId: uid,
      fileName: file.name,
      // No Storage bucket in this configuration: only extracted text is kept.
      storagePath: null,
      pageCount: extracted.pageCount,
      fileType,
      // "processing" means the text isn't there yet and OCR has been offered;
      // the document is real either way, so it is never lost to the library.
      status: canOcr ? "processing" : "ready",
      sizeBytes: file.size,
      characterCount: extracted.characterCount,
      emptyPages: extracted.emptyPages,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Pages go in a subcollection: 150 pages of text would blow the 1 MiB
    // per-document ceiling, and generation reads them a chunk at a time anyway.
    const pages = db.batch();
    for (const page of extracted.pages) {
      pages.set(docRef.collection("pages").doc(String(page.page)), {
        page: page.page,
        text: page.text.slice(0, MAX_CHARS_PER_PAGE_DOC),
      });
    }
    await pages.commit();

    return NextResponse.json({
      documentId: docRef.id,
      fileName: file.name,
      pageCount: extracted.pageCount,
      fileType,
      emptyPages: extracted.emptyPages,
      needsOcr: canOcr,
    });
  } catch (error) {
    if (error instanceof ExtractionError) return fail(422, error.userMessage);
    logRouteError("documents.ingest", error, { uid });
    return fail(500, "Something went wrong reading that file. Please try again.");
  }
}

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}
