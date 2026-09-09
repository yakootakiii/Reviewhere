import { NextResponse } from "next/server";
import { isAdminConfigured, uidFromAuthHeader } from "@/lib/firebase/admin";
import { logRouteError } from "@/lib/log";
import { deleteDocumentDeep } from "@/lib/generation/server";
import { GenerationError } from "@/lib/generation/types";

export const runtime = "nodejs";

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
