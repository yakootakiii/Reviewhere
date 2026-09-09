/**
 * The one validator. Mode A's JSON objects and Mode B's CSV rows both arrive
 * here, which is what keeps the promise in §2.2 that quiz-taking, scoring and
 * review never learn how a quiz was made.
 *
 * It reads both naming styles on purpose — `prompt`/`question`,
 * `correctAnswer`/`correct_answer`, a `choices` array or `choice_a`…`choice_d`
 * columns — so neither mode needs an adapter that could drift from the other.
 */
import type { Difficulty, QuestionType } from "@/lib/types";
import type { QuestionDraft, ValidationContext } from "./types";

export const MCQ_CHOICE_COUNT = 4;
export const CHOICE_COLUMNS = ["choice_a", "choice_b", "choice_c", "choice_d"] as const;

/** Letters and 1-based indices both show up in practice; map them to a slot. */
const ANSWER_KEYS: Record<string, number> = {
  a: 0, b: 1, c: 2, d: 3,
  "1": 0, "2": 1, "3": 2, "4": 3,
};

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "mixed"];

export type RawQuestion = Record<string, unknown>;

export type RowResult =
  | { ok: true; question: QuestionDraft }
  | { ok: false; errors: string[] };

export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

/** Comparison key for dedupe: case, punctuation and spacing carry no meaning here. */
export function promptKey(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function field(row: RawQuestion, ...names: string[]): unknown {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function readChoices(row: RawQuestion): string[] {
  const direct = row.choices;
  if (Array.isArray(direct)) {
    return direct.map(normalizeText).filter(Boolean);
  }
  return CHOICE_COLUMNS.map((column) => normalizeText(row[column])).filter(Boolean);
}

function readAcceptedAnswers(row: RawQuestion): string[] {
  const raw = field(row, "acceptedAnswers", "accepted_answers");
  if (raw === undefined) return [];
  // §2.2.1: pipe-separated in CSV; Mode A may hand back a real array.
  const parts = Array.isArray(raw) ? raw : String(raw).split("|");
  const seen = new Set<string>();
  const answers: string[] = [];
  for (const part of parts) {
    const value = normalizeText(part);
    const key = value.toLowerCase();
    if (value && !seen.has(key)) {
      seen.add(key);
      answers.push(value);
    }
  }
  return answers;
}

function readDifficulty(row: RawQuestion, fallback: Difficulty): Difficulty {
  const raw = normalizeText(field(row, "difficulty")).toLowerCase();
  return (DIFFICULTIES as string[]).includes(raw) ? (raw as Difficulty) : fallback;
}

/**
 * Resolves the stated answer to one of the four choices, accepting the answer
 * text itself or a letter/index. Returns the canonical choice text so storage
 * never depends on the letter the generator happened to use.
 */
function resolveMcqAnswer(stated: string, choices: string[]): string | null {
  const exact = choices.find((choice) => choice.toLowerCase() === stated.toLowerCase());
  if (exact) return exact;

  const key = stated.toLowerCase().replace(/[).\s]/g, "");
  const index = ANSWER_KEYS[key];
  return index !== undefined && index < choices.length ? choices[index] : null;
}

export function validateQuestionRow(row: RawQuestion, context: ValidationContext): RowResult {
  const errors: string[] = [];

  const rawType = normalizeText(field(row, "type")).toLowerCase();
  const type: QuestionType | null =
    rawType === "mcq" || rawType === "multiple_choice" || rawType === "multiple choice"
      ? "mcq"
      : rawType === "identification" || rawType === "id"
        ? "identification"
        : null;
  if (!type) {
    errors.push(
      rawType
        ? `Unknown type "${rawType}" — it has to be mcq or identification.`
        : "Missing the type column — it has to be mcq or identification.",
    );
  }

  const prompt = normalizeText(field(row, "prompt", "question"));
  if (!prompt) errors.push("The question text is empty.");

  const explanation = normalizeText(field(row, "explanation"));
  // CLAUDE.md invariant: every question carries an explanation, shown in review.
  if (!explanation) errors.push("Missing an explanation — every question needs one.");

  const sourcePage = readSourcePage(field(row, "sourcePage", "source_page"), context, errors);

  const statedAnswer = normalizeText(field(row, "correctAnswer", "correct_answer"));
  if (!statedAnswer) errors.push("Missing the correct answer.");

  const choices = readChoices(row);
  let correctAnswer = statedAnswer;
  let acceptedAnswers: string[] | undefined;

  if (type === "mcq") {
    if (choices.length !== MCQ_CHOICE_COUNT) {
      errors.push(
        `Multiple-choice questions need all ${MCQ_CHOICE_COUNT} choices — this row has ${choices.length}.`,
      );
    } else if (new Set(choices.map((choice) => choice.toLowerCase())).size !== MCQ_CHOICE_COUNT) {
      errors.push("Two of the four choices are the same.");
    } else if (statedAnswer) {
      const resolved = resolveMcqAnswer(statedAnswer, choices);
      if (resolved) {
        correctAnswer = resolved;
      } else {
        errors.push(`The correct answer "${statedAnswer}" doesn't match any of the four choices.`);
      }
    }
  } else if (type === "identification") {
    if (choices.length > 0) {
      errors.push("Identification questions leave the four choice columns blank.");
    }
    acceptedAnswers = readAcceptedAnswers(row).filter(
      (answer) => answer.toLowerCase() !== correctAnswer.toLowerCase(),
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    question: {
      type: type!,
      prompt,
      ...(type === "mcq" ? { choices } : {}),
      correctAnswer,
      ...(acceptedAnswers && acceptedAnswers.length > 0 ? { acceptedAnswers } : {}),
      explanation,
      sourcePage,
      difficulty: readDifficulty(row, context.fallbackDifficulty),
    },
  };
}

function readSourcePage(
  raw: unknown,
  context: ValidationContext,
  errors: string[],
): number {
  const page = Math.trunc(Number(normalizeText(raw)));
  if (!Number.isFinite(page) || page === 0) {
    // CLAUDE.md invariant: every question carries a sourcePage.
    errors.push("Missing the source page number.");
    return 0;
  }
  if (page < 1 || page > context.pageCount) {
    errors.push(
      `Source page ${page} is outside this document, which has ${context.pageCount} page${context.pageCount === 1 ? "" : "s"}.`,
    );
    return 0;
  }
  return page;
}

export interface DedupeResult {
  kept: QuestionDraft[];
  duplicates: number;
}

/** Chunked generation asks about overlapping material, so repeats are expected. */
export function dedupe(questions: QuestionDraft[]): DedupeResult {
  const seen = new Set<string>();
  const kept: QuestionDraft[] = [];

  for (const question of questions) {
    const key = `${question.type}:${promptKey(question.prompt)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(question);
  }

  return { kept, duplicates: questions.length - kept.length };
}

/**
 * §2.2: questions are interleaved by type, not grouped, to mimic a real exam.
 * Spreads the smaller group evenly through the larger one rather than strictly
 * alternating, so a 30/70 mix still feels shuffled instead of front-loaded.
 */
export function interleave(questions: QuestionDraft[]): QuestionDraft[] {
  const mcq = questions.filter((question) => question.type === "mcq");
  const identification = questions.filter((question) => question.type === "identification");
  if (mcq.length === 0 || identification.length === 0) return [...questions];

  const total = mcq.length + identification.length;
  const ordered: QuestionDraft[] = [];
  let takenMcq = 0;
  let takenId = 0;

  for (let position = 0; position < total; position += 1) {
    // Take from whichever type is furthest behind its share of the sequence.
    const mcqDebt = mcq.length > takenMcq ? (takenMcq + 1) / mcq.length : Infinity;
    const idDebt = identification.length > takenId ? (takenId + 1) / identification.length : Infinity;
    if (mcqDebt <= idDebt) {
      ordered.push(mcq[takenMcq]);
      takenMcq += 1;
    } else {
      ordered.push(identification[takenId]);
      takenId += 1;
    }
  }

  return ordered;
}

/**
 * Firestore has no inherent document order, and the interleaving above is the
 * order the user should see. Zero-padded ids make the natural id ordering the
 * question order, so no field outside the §4 schema is needed to carry it.
 */
export function questionDocId(index: number): string {
  return `q${String(index + 1).padStart(3, "0")}`;
}

/**
 * Chunks routinely over- or under-deliver, so trim the pool back toward what
 * the user actually asked for: fill each type up to its share first, then let
 * the type with spare questions cover any shortfall in the other.
 */
export function selectForQuota(
  questions: QuestionDraft[],
  quota: { mcq: number; identification: number },
): QuestionDraft[] {
  const mcq = questions.filter((question) => question.type === "mcq");
  const identification = questions.filter((question) => question.type === "identification");

  const chosen = [...mcq.slice(0, quota.mcq), ...identification.slice(0, quota.identification)];
  const shortfall = quota.mcq + quota.identification - chosen.length;
  if (shortfall <= 0) return chosen;

  const leftovers = [...mcq.slice(quota.mcq), ...identification.slice(quota.identification)];
  return [...chosen, ...leftovers.slice(0, shortfall)];
}
