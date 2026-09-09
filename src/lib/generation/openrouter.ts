/**
 * Mode A's model client (§3.1).
 *
 * Two failure kinds are handled differently on purpose:
 *   - availability (429 / 5xx / unknown model) walks down the model chain;
 *   - malformed or unusable output gets exactly ONE stricter retry on the same
 *     model, which is the contract in §2.2, and then the chunk is given up on.
 * Neither one is allowed to take the whole generation down on its own.
 */
import { validateQuestionRow } from "./questions";
import { MODE_A_RETRY_PREFIX, MODE_A_SYSTEM_PROMPT, modeAUserPrompt } from "./prompt";
import type { TextChunk } from "./chunking";
import type { QuestionDraft, QuizSettings, ValidationContext } from "./types";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Verified against OpenRouter's live model list on 2026-09-09: these are free
 * models that advertise structured outputs, strongest first. Free-tier
 * availability shifts (§3.1), so OPENROUTER_MODEL overrides the head of the
 * chain without a code change.
 */
export const DEFAULT_MODEL_CHAIN = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nex-agi/nex-n2.5-pro:free",
  "dots-studio/dots-3-note-preview:free",
];

/** A function rather than a const so tests and the route see the live env. */
export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export function modelChain(): string[] {
  const override = process.env.OPENROUTER_MODEL?.trim();
  if (!override) return DEFAULT_MODEL_CHAIN;
  return [override, ...DEFAULT_MODEL_CHAIN.filter((model) => model !== override)];
}

/**
 * The keys a model plausibly wraps the questions in. Deliberately a fixed list:
 * accepting "the first array in the object" once matched a question's `choices`
 * array and turned four option strings into four bogus rows.
 */
const WRAPPER_KEYS = ["questions", "items", "data", "results", "output"];

/**
 * Free models wrap JSON in prose or code fences more often than not, so pull the
 * questions out rather than trusting the whole body to parse.
 */
export function extractJsonArray(content: string): unknown[] | null {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");

  const direct = tryParse(trimmed);
  if (direct) return direct;

  // Fall back to the outermost bracketed span, for a reply padded with prose.
  const fromArray = sliceBetween(trimmed, "[", "]");
  if (fromArray) return fromArray;
  return sliceBetween(trimmed, "{", "}");
}

function sliceBetween(text: string, open: string, close: string): unknown[] | null {
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start === -1 || end <= start) return null;
  return tryParse(text.slice(start, end + 1));
}

/**
 * An array is only the question list if it holds objects. An array of strings
 * is something else that happened to be lying around — a `choices` list, most
 * often — and treating it as rows produces nonsense.
 */
function asRows(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return [];
  return value.every((entry) => entry !== null && typeof entry === "object") ? value : null;
}

function tryParse(text: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(text);
    const direct = asRows(parsed);
    if (direct) return direct;
    if (!parsed || typeof parsed !== "object") return null;

    const record = parsed as Record<string, unknown>;
    for (const key of WRAPPER_KEYS) {
      const rows = asRows(record[key]);
      if (rows) return rows;
    }
    // A lone question object, returned instead of a one-element array.
    if ("type" in record && ("prompt" in record || "question" in record)) return [record];
    return null;
  } catch {
    return null;
  }
}

class ModelUnavailable extends Error {
  constructor(
    readonly model: string,
    readonly status: number,
    readonly retryAfterMs: number | null,
  ) {
    super(`${model} unavailable (${status})`);
  }
}

export interface ChunkOutcome {
  questions: QuestionDraft[];
  /** Rows the model produced that failed validation and were discarded. */
  rejected: number;
  model: string;
  retried: boolean;
}

export interface GenerateOptions {
  signal?: AbortSignal;
  /** Called with user-facing copy when something slow or unexpected happens. */
  onNotice?: (message: string) => void;
  /** Injectable so tests can drive the retry contract without real waiting. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** Past this a retry is slower than moving to the next model. */
const MAX_RETRY_AFTER_MS = 5_000;

export async function generateQuestionsForChunk(
  chunk: TextChunk,
  settings: QuizSettings,
  context: ValidationContext,
  options: GenerateOptions = {},
): Promise<ChunkOutcome> {
  const sleep = options.sleep ?? defaultSleep;
  const chain = modelChain();
  let lastUnavailable: ModelUnavailable | null = null;

  for (const model of chain) {
    try {
      const first = await attempt(model, chunk, settings, context, false, options);
      if (first.questions.length > 0) return first;

      // The one auto-retry, with a stricter instruction (§2.2 Mode A step 3).
      options.onNotice?.("That reply came back malformed — asking once more, more strictly.");
      const second = await attempt(model, chunk, settings, context, true, options);
      return { ...second, retried: true };
    } catch (error) {
      if (error instanceof ModelUnavailable) {
        lastUnavailable = error;
        if (error.status === 429) {
          // §3.1: rate limits are expected on the free tier; say so honestly.
          options.onNotice?.("Still generating, this may take a bit longer.");
          if (error.retryAfterMs !== null && error.retryAfterMs <= MAX_RETRY_AFTER_MS) {
            await sleep(error.retryAfterMs);
            const retried = await attempt(model, chunk, settings, context, false, options);
            if (retried.questions.length > 0) return retried;
          }
        }
        continue;
      }
      throw error;
    }
  }

  throw new GenerationUnavailable(lastUnavailable);
}

export class GenerationUnavailable extends Error {
  constructor(readonly cause: ModelUnavailable | null) {
    super("No free model in the chain was available.");
    this.name = "GenerationUnavailable";
  }
}

async function attempt(
  model: string,
  chunk: TextChunk,
  settings: QuizSettings,
  context: ValidationContext,
  strict: boolean,
  options: GenerateOptions,
): Promise<ChunkOutcome> {
  const userPrompt = strict
    ? `${MODE_A_RETRY_PREFIX}\n\n${modeAUserPrompt(chunk, settings)}`
    : modeAUserPrompt(chunk, settings);

  const response = await fetch(ENDPOINT, {
    method: "POST",
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
      "Content-Type": "application/json",
      // OpenRouter uses these for its free-tier dashboards; both are optional.
      "X-Title": "Reviewhere",
    },
    body: JSON.stringify({
      model,
      temperature: strict ? 0.2 : 0.6,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: MODE_A_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    // 429 and 5xx are transient; 400/404 usually mean this model is gone.
    throw new ModelUnavailable(model, response.status, retryAfterMs(response));
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content ?? "";
  const rows = extractJsonArray(content) ?? [];

  const questions: QuestionDraft[] = [];
  let rejected = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      rejected += 1;
      continue;
    }
    const result = validateQuestionRow(row as Record<string, unknown>, context);
    if (result.ok) questions.push(result.question);
    else rejected += 1;
  }

  return { questions, rejected, model, retried: false };
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}
