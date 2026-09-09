import { NextResponse } from "next/server";
import { isAdminConfigured, uidFromAuthHeader } from "@/lib/firebase/admin";
import { logRouteError } from "@/lib/log";
import { duplicateQuiz } from "@/lib/generation/server";
import { GenerationError } from "@/lib/generation/types";

export const runtime = "nodejs";

/** §2.6 duplicate. /quizzes is server-write-only, so the copy is made here. */
export async function POST(
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
    const copyId = await duplicateQuiz(uid, quizId);
    return NextResponse.json({ quizId: copyId });
  } catch (error) {
    if (error instanceof GenerationError) {
      return NextResponse.json({ error: error.userMessage }, { status: 404 });
    }
    logRouteError("quizzes.duplicate", error, { uid, quizId });
    return NextResponse.json(
      { error: "Something went wrong duplicating that quiz. Please try again." },
      { status: 500 },
    );
  }
}
