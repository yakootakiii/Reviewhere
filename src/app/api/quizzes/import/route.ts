import { NextResponse } from "next/server";
import { isAdminConfigured, uidFromAuthHeader } from "@/lib/firebase/admin";
import { logRouteError } from "@/lib/log";
import { validateCsvRow, type CsvValues } from "@/lib/generation/csv-import";
import { dedupe, interleave } from "@/lib/generation/questions";
import { normalizeSettings } from "@/lib/generation/settings";
import { loadOwnedDocument, writeQuiz } from "@/lib/generation/server";
import {
  GenerationError,
  type QuestionDraft,
  type QuizSettings,
  type RowError,
} from "@/lib/generation/types";
import { quizTitleFor } from "@/lib/quiz-shared";

export const runtime = "nodejs";

/**
 * Mode B (§2.2). The browser already parsed and previewed the CSV, but the rows
 * are re-run through the same validator here — the preview is UX, this is the
 * boundary. Both modes then persist through the same `writeQuiz`, so a manual
 * quiz is indistinguishable from a generated one downstream.
 */
export async function POST(request: Request) {
  if (!isAdminConfigured) {
    return NextResponse.json({ error: "The server isn't configured for imports yet." }, { status: 503 });
  }

  const uid = await uidFromAuthHeader(request.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Please sign in again and retry." }, { status: 401 });

  let body: { documentId?: string; settings?: Partial<QuizSettings>; rows?: CsvValues[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That request didn't come through." }, { status: 400 });
  }

  try {
    const document = await loadOwnedDocument(uid, body.documentId ?? "");
    const settings = normalizeSettings(body.settings ?? {}, document.pageCount);

    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) {
      throw new GenerationError("There were no questions to import.");
    }

    const context = {
      pageCount: document.pageCount,
      fallbackDifficulty: settings.difficulty,
    };

    const questions: QuestionDraft[] = [];
    const rowErrors: RowError[] = [];

    rows.forEach((values, index) => {
      const result = validateCsvRow(values ?? {}, context);
      if (result.ok) questions.push(result.question);
      // Row 1 is the header, so the first data row is row 2.
      else rowErrors.push({ rowNumber: index + 2, values: values ?? {}, errors: result.errors });
    });

    if (rowErrors.length > 0) {
      return NextResponse.json(
        {
          error: `${rowErrors.length} row${rowErrors.length === 1 ? "" : "s"} still can't be imported. Fix them in the preview and try again.`,
          rowErrors,
        },
        { status: 422 },
      );
    }

    const { kept, duplicates } = dedupe(questions);
    const quizId = await writeQuiz({
      uid,
      document,
      settings,
      questions: interleave(kept),
      generationMode: "manualCsv",
      title: quizTitleFor(document.fileName),
    });

    return NextResponse.json({ quizId, questionCount: kept.length, duplicates });
  } catch (error) {
    if (error instanceof GenerationError) {
      return NextResponse.json({ error: error.userMessage }, { status: 400 });
    }
    logRouteError("quizzes.import", error, { uid });
    return NextResponse.json(
      { error: "Something went wrong saving that quiz. Please try again." },
      { status: 500 },
    );
  }
}
