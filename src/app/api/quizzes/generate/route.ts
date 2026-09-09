import { NextResponse } from "next/server";
import { isAdminConfigured, uidFromAuthHeader } from "@/lib/firebase/admin";
import { logRouteError } from "@/lib/log";
import { buildChunks } from "@/lib/generation/chunking";
import {
  generateQuestionsForChunk,
  GenerationUnavailable,
  isOpenRouterConfigured,
  modelChain,
} from "@/lib/generation/openrouter";
import { dedupe, interleave, selectForQuota } from "@/lib/generation/questions";
import { normalizeSettings, resolveCounts } from "@/lib/generation/settings";
import {
  assertModeAQuota,
  loadOwnedDocument,
  loadPages,
  recordModeAGeneration,
  writeQuiz,
} from "@/lib/generation/server";
import {
  GenerationError,
  type GenerationEvent,
  type QuestionDraft,
  type QuizSettings,
} from "@/lib/generation/types";
import { quizTitleFor } from "@/lib/quiz-shared";

/** The OpenRouter client and the Admin SDK both need the Node runtime. */
export const runtime = "nodejs";
/**
 * Free models are slow and queued behind paid traffic (§3.1), and a generation
 * makes several calls, so this is generous on purpose.
 */
export const maxDuration = 300;

/** Lets the create flow lead with Mode B when Mode A can't work (§3.1). */
export async function GET() {
  return NextResponse.json({
    available: isAdminConfigured && isOpenRouterConfigured(),
    model: modelChain()[0],
  });
}

/**
 * Mode A (§2.2). Progress is streamed as NDJSON rather than answered in one
 * silent response: a multi-chunk generation runs well past a spinner's welcome,
 * and §7.7 asks for honest progress copy instead of a fabricated percentage.
 */
export async function POST(request: Request) {
  if (!isAdminConfigured) {
    return fail(503, "The server isn't configured for generation yet.");
  }

  const uid = await uidFromAuthHeader(request.headers.get("authorization"));
  if (!uid) return fail(401, "Please sign in again and retry.");

  if (!isOpenRouterConfigured()) {
    return fail(
      503,
      "Automatic generation isn't set up on this server. You can still build this quiz with the copy-paste prompt.",
      true,
    );
  }

  let body: { documentId?: string; settings?: Partial<QuizSettings> };
  try {
    body = await request.json();
  } catch {
    return fail(400, "That request didn't come through. Please try again.");
  }

  let document: Awaited<ReturnType<typeof loadOwnedDocument>>;
  let settings: QuizSettings;
  try {
    document = await loadOwnedDocument(uid, body.documentId ?? "");
    settings = normalizeSettings(body.settings ?? {}, document.pageCount);
    await assertModeAQuota(uid);
  } catch (error) {
    if (error instanceof GenerationError) {
      return fail(error.offerModeB ? 429 : 400, error.userMessage, error.offerModeB);
    }
    logRouteError("quizzes.generate.preflight", error, { uid });
    return fail(500, "Something went wrong starting generation. Please try again.");
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: GenerationEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        const pages = await loadPages(document.id);
        const chunks = buildChunks(pages, settings.scope, settings.questionCount);
        if (chunks.length === 0) {
          throw new GenerationError(
            "There's no readable text in that page range. Try a wider range.",
            { offerModeB: true },
          );
        }

        const collected: QuestionDraft[] = [];
        let usedModel: string | null = null;
        let failedChunks = 0;

        for (const [index, chunk] of chunks.entries()) {
          send({
            type: "progress",
            message: `Writing questions from pages ${chunk.from}–${chunk.to}…`,
            completed: index,
            total: chunks.length,
            questions: collected.length,
          });

          try {
            const outcome = await generateQuestionsForChunk(
              chunk,
              settings,
              { pageCount: document.pageCount, fallbackDifficulty: settings.difficulty },
              {
                signal: request.signal,
                onNotice: (message) => send({ type: "notice", message }),
              },
            );
            usedModel = outcome.model;
            if (outcome.questions.length === 0) failedChunks += 1;
            collected.push(...outcome.questions);
          } catch (error) {
            if (error instanceof GenerationUnavailable) throw error;
            logRouteError("quizzes.generate.chunk", error, { uid, from: chunk.from, to: chunk.to });
            failedChunks += 1;
          }
        }

        // §2.2: only a total washout falls back to Mode B. A partial result is
        // still a usable quiz, and the client says plainly that it came up short.
        if (collected.length === 0) {
          throw new GenerationError(
            failedChunks > 0
              ? "The free model couldn't produce usable questions from this document. The copy-paste prompt below works with any LLM."
              : "No questions came back from that document.",
            { offerModeB: true },
          );
        }

        const { kept } = dedupe(collected);
        const questions = interleave(
          selectForQuota(kept, resolveCounts(settings.questionCount, settings.mcqPct)),
        );

        send({
          type: "progress",
          message: "Saving your quiz…",
          completed: chunks.length,
          total: chunks.length,
          questions: questions.length,
        });

        const quizId = await writeQuiz({
          uid,
          document,
          settings,
          questions,
          generationMode: "auto",
          title: quizTitleFor(document.fileName),
          model: usedModel,
        });
        await recordModeAGeneration(uid);

        send({
          type: "done",
          quizId,
          questionCount: questions.length,
          requested: settings.questionCount,
        });
      } catch (error) {
        if (error instanceof GenerationError) {
          send({ type: "error", message: error.userMessage, offerModeB: error.offerModeB });
        } else if (error instanceof GenerationUnavailable) {
          send({
            type: "error",
            message:
              "Every free model is busy right now. Try again in a few minutes, or use the copy-paste prompt below with any LLM.",
            offerModeB: true,
          });
        } else {
          logRouteError("quizzes.generate", error, { uid });
          send({
            type: "error",
            message: "Something went wrong while generating. Your document is safe in the library.",
            offerModeB: true,
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
    },
  });
}

function fail(status: number, message: string, offerModeB = false) {
  return NextResponse.json({ error: message, offerModeB }, { status });
}
