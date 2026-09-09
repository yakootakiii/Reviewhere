import { NextResponse } from "next/server";
import { isAdminConfigured, uidFromAuthHeader } from "@/lib/firebase/admin";
import { logRouteError } from "@/lib/log";
import { deleteQuizDeep } from "@/lib/generation/server";
import { GenerationError } from "@/lib/generation/types";

export const runtime = "nodejs";

/** Same reason as the document route: questions are server-owned, so is cleanup. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ quizId: string }> },
) {
  if (!isAdminConfigured) {
    return NextResponse.json({ error: "The server isn't configured for this yet." }, { status: 503 });
  }

  const uid = await uidFromAuthHeader(request.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Please sign in again and retry." }, { status: 401 });

  const { quizId } = await params;

  try {
    await deleteQuizDeep(uid, quizId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof GenerationError) {
      return NextResponse.json({ error: error.userMessage }, { status: 404 });
    }
    logRouteError("quizzes.delete", error, { uid, quizId });
    return NextResponse.json(
      { error: "Something went wrong deleting that quiz. Please try again." },
      { status: 500 },
    );
  }
}
