import { NextResponse } from "next/server";
import { adminDb, isAdminConfigured, uidFromAuthHeader } from "@/lib/firebase/admin";
import { logRouteError } from "@/lib/log";
import { deleteDocumentDeep } from "@/lib/generation/server";
import { GenerationError } from "@/lib/generation/types";
import { MAX_CHARS_PER_PAGE_DOC } from "@/lib/documents-shared";

export const runtime = "nodejs";

/**
 * Corrects one page of transcribed text (§3.3).
 *
 * OCR of handwriting misreads words, and a misread word becomes a confidently
 * wrong quiz question that a student revising from it cannot catch. So the
 * transcription is editable — and the edit has to come through here, because
 * `/documents/{id}/pages` is `write: false` in the rules for the same reason
 * deletes are: the client is not the boundary.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  if (!isAdminConfigured) {
    return NextResponse.json({ error: "The server isn't configured for this yet." }, { status: 503 });
  }

  const uid = await uidFromAuthHeader(request.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Please sign in again and retry." }, { status: 401 });

  const { documentId } = await params;

  let body: { page?: unknown; text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That request didn't come through." }, { status: 400 });
  }

  const page = Number(body.page);
  const text = typeof body.text === "string" ? body.text : null;
  if (!Number.isInteger(page) || page < 1 || text === null) {
    return NextResponse.json({ error: "That edit didn't come through." }, { status: 400 });
  }

  try {
    const docRef = adminDb().collection("documents").doc(documentId);
    const snapshot = await docRef.get();
    const document = snapshot.data();
    if (!snapshot.exists || !document || document.ownerId !== uid) {
      return NextResponse.json({ error: "We couldn't find that document." }, { status: 404 });
    }
    if (page > (Number(document.pageCount) || 0)) {
      return NextResponse.json({ error: "That page isn't in this document." }, { status: 400 });
    }

    await docRef.collection("pages").doc(String(page)).set({
      page,
      text: text.slice(0, MAX_CHARS_PER_PAGE_DOC),
    });
    return NextResponse.json({ page, saved: true });
  } catch (error) {
    logRouteError("documents.page.patch", error, { uid, documentId });
    return NextResponse.json(
      { error: "Something went wrong saving that edit. Please try again." },
      { status: 500 },
    );
  }
}

/**
 * Deleting a document has to happen server-side: `/documents/{id}/pages` is
 * `write: false` in the rules, and Firestore has no cascade, so a client-side
 * delete of the parent would orphan every page row.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  if (!isAdminConfigured) {
    return NextResponse.json({ error: "The server isn't configured for this yet." }, { status: 503 });
  }

  const uid = await uidFromAuthHeader(request.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Please sign in again and retry." }, { status: 401 });

  // Next 16 hands route params to handlers as a promise.
  const { documentId } = await params;

  try {
    await deleteDocumentDeep(uid, documentId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof GenerationError) {
      return NextResponse.json({ error: error.userMessage }, { status: 404 });
    }
    logRouteError("documents.delete", error, { uid, documentId });
    return NextResponse.json(
      { error: "Something went wrong deleting that document. Please try again." },
      { status: 500 },
    );
  }
}
