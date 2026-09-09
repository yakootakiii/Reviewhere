/**
 * Prompts for both modes. They ask for the same field names on purpose, so the
 * single validator in questions.ts reads either one without an adapter.
 */
import type { ExtractedPage } from "@/lib/extraction/types";
import { CSV_HEADER } from "./csv-import";
import { selectPages } from "./chunking";
import { resolveCounts } from "./settings";
import type { QuizScope, QuizSettings } from "./types";
import type { TextChunk } from "./chunking";

const DIFFICULTY_COPY: Record<string, string> = {
  easy: "recall-level questions a student should get right after one read",
  medium: "questions that need real understanding of the material",
  hard: "questions that require applying or connecting ideas across the material",
  mixed: "a spread of easy, medium and hard questions",
};

/* ------------------------------------------------------------------ Mode A */

/**
 * §3.1: free models are the weak link on strict JSON, so the system prompt does
 * the heavy lifting and the route validates whatever comes back regardless.
 */
export const MODE_A_SYSTEM_PROMPT = [
  "You write exam questions from study material.",
  'You reply with a single JSON object of the form {"questions": [ ... ]} and nothing else — no prose, no markdown, no code fences.',
  // The request is sent in JSON mode, which requires an object at the top
  // level. Asking for a bare array contradicts that, and models resolve the
  // conflict by emitting comma-joined objects inside one pair of braces.
  "Every element of the questions array is an object with exactly these keys:",
  '  "type": "mcq" or "identification"',
  '  "prompt": the question text',
  '  "choices": for mcq, an array of exactly 4 distinct plausible options; omit for identification',
  '  "correct_answer": for mcq, the exact text of the correct choice; for identification, the expected answer',
  '  "accepted_answers": for identification, an array of alternate acceptable spellings or phrasings; omit for mcq',
  '  "explanation": one or two sentences on why the answer is right',
  '  "source_page": the number from the "--- Page N ---" marker the question came from',
  "Never invent facts that are not in the supplied material.",
  "Never write a question that cannot be answered from the material alone.",
].join("\n");

/** The one auto-retry (§2.2 Mode A step 3) leads with this. */
export const MODE_A_RETRY_PREFIX =
  'Your previous reply could not be parsed. Return ONLY a valid JSON object shaped {"questions": [...]}. ' +
  "No explanation, no markdown, no code fences — the first character must be { and the last must be }. " +
  "Each question must be a separate object inside the questions array, not merged keys.";

export function modeAUserPrompt(chunk: TextChunk, settings: QuizSettings): string {
  const { mcq, identification } = resolveCounts(chunk.quota, settings.mcqPct);

  return [
    `Write ${chunk.quota} question${chunk.quota === 1 ? "" : "s"} from the material below:`,
    `- ${mcq} of type "mcq"`,
    `- ${identification} of type "identification"`,
    `Aim for ${DIFFICULTY_COPY[settings.difficulty] ?? DIFFICULTY_COPY.mixed}.`,
    `Use source_page values between ${chunk.from} and ${chunk.to}, taken from the page markers.`,
    "",
    "MATERIAL:",
    chunk.text,
  ].join("\n");
}

/* ------------------------------------------------------------------ Mode B */

/**
 * How much document text the copy-ready prompt embeds. Long enough for a normal
 * reviewer, short enough to paste into a chat box; past this the user is told to
 * narrow the scope rather than being handed a silently truncated prompt.
 */
export const MODE_B_TEXT_BUDGET = 120_000;

export interface ModeBPrompt {
  prompt: string;
  truncated: boolean;
  /** The page range actually embedded, which may be smaller than the scope. */
  includedFrom: number;
  includedTo: number;
}

/**
 * §2.2 Mode B step 2: the settings *and* the document text are already in the
 * prompt, so the user only has to copy, paste, and bring the CSV back.
 */
export function buildModeBPrompt(
  pages: ExtractedPage[],
  settings: QuizSettings,
  document: { fileName: string; pageCount: number },
  budget = MODE_B_TEXT_BUDGET,
): ModeBPrompt {
  const selected = selectPages(pages, settings.scope);
  const { mcq, identification } = resolveCounts(settings.questionCount, settings.mcqPct);

  const included: string[] = [];
  let used = 0;
  let truncated = false;
  const includedFrom = selected[0]?.page ?? 1;
  let includedTo = includedFrom;

  for (const page of selected) {
    const block = `--- Page ${page.page} ---\n${page.text.trim()}`;
    if (used + block.length > budget && included.length > 0) {
      truncated = true;
      break;
    }
    included.push(block);
    used += block.length;
    includedTo = page.page;
  }

  const prompt = [
    `You are helping me study "${document.fileName}".`,
    "",
    `Write ${settings.questionCount} exam questions from the material at the end of this message:`,
    `- ${mcq} multiple choice`,
    `- ${identification} identification (free-text answer)`,
    `Aim for ${DIFFICULTY_COPY[settings.difficulty] ?? DIFFICULTY_COPY.mixed}.`,
    "",
    "Reply with ONLY a CSV file — no prose before or after it, no markdown, no code fences.",
    "The first line must be exactly this header:",
    CSV_HEADER.join(","),
    "",
    "Rules for the CSV:",
    '- "type" is either mcq or identification.',
    "- mcq rows fill all four choice columns; correct_answer is the exact text of the correct choice.",
    "- identification rows leave choice_a, choice_b, choice_c and choice_d completely blank.",
    "- accepted_answers is for identification only: alternate acceptable spellings separated by a pipe (|), for example mitochondria|mitochondrion. Leave it blank for mcq.",
    "- explanation is one or two sentences on why the answer is right. Every row needs one.",
    '- source_page is the number from the "--- Page N ---" marker the question came from. Every row needs one.',
    "- Follow RFC 4180 quoting: wrap any field containing a comma, quote or line break in double quotes, and double any quote inside a field.",
    "- Do not invent anything that is not in the material below.",
    "",
    "MATERIAL:",
    included.join("\n\n"),
  ].join("\n");

  return { prompt, truncated, includedFrom, includedTo };
}

export function describeRange(scope: QuizScope | null, pageCount: number): string {
  return scope ? `pages ${scope.from}–${scope.to}` : `all ${pageCount} pages`;
}
