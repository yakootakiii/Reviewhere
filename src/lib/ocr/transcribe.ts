/**
 * Reading a page of handwriting with a vision model (§3.3).
 *
 * This is the same endpoint and the same failure contract as Mode A's client:
 * availability failures (429/5xx/unknown model) walk down the chain, and a
 * page that comes back unusable is given up on rather than taking the document
 * with it. The chain is separate only because it must hold models that accept
 * image input, which the text chain's head does not.
 *
 * Tesseract would be the conventional answer here and is the wrong one: it is
 * trained on printed type and is poor at handwriting, which is the entire use
 * case. The models below already serve Mode A, so this adds no new dependency,
 * no new key and no new cost.
 */

import { encodePng, toDataUrl, type RawImage } from "./png";
import { downscale } from "./downscale";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Free models advertising image input, verified against OpenRouter's live model
 * list on 2026-09-10, strongest first. The first two are already in the Mode A
 * text chain. Availability shifts, so OPENROUTER_VISION_MODEL overrides the
 * head without a code change — the same escape hatch OPENROUTER_MODEL gives.
 */
export const DEFAULT_VISION_CHAIN = [
  "nex-agi/nex-n2.5-pro:free",
  "dots-studio/dots-3-note-preview:free",
  "google/gemma-4-31b-it:free",
];

export function visionChain(): string[] {
  const override = process.env.OPENROUTER_VISION_MODEL?.trim();
  if (!override) return DEFAULT_VISION_CHAIN;
  return [override, ...DEFAULT_VISION_CHAIN.filter((model) => model !== override)];
}

/**
 * Two instructions carry most of the value here. "Transcribe, don't summarise"
 * stops the model helpfully condensing a page into bullet points — the text
 * becomes quiz source material, so paraphrase would generate questions about
 * words the student never wrote. Describing diagrams inline keeps the arrows
 * and sketches that are half of what handwritten notes contain, without needing
 * anything downstream to understand images.
 */
export const TRANSCRIBE_PROMPT = [
  "Transcribe this page of notes exactly as written.",
  "",
  "Rules:",
  "- Reproduce the words verbatim. Do not summarise, correct, reword or add anything.",
  "- Keep the original line breaks and the order things appear on the page.",
  "- Preserve abbreviations, arrows, symbols and shorthand as written.",
  "- Where there is a diagram, chart or sketch, describe it in square brackets on",
  "  its own line, like: [diagram: cycle showing glucose -> pyruvate -> acetyl-CoA]",
  "- If a word is genuinely illegible, write [?] in its place rather than guessing.",
  "- If the page has no writing on it at all, reply with nothing.",
  "",
  "Output only the transcription. No preamble, no commentary, no code fences.",
].join("\n");

export class VisionUnavailable extends Error {
  constructor(readonly lastStatus: number | null) {
    super("No free vision model in the chain was available.");
    this.name = "VisionUnavailable";
  }
}

class ModelUnavailable extends Error {
  constructor(
    readonly model: string,
    readonly status: number,
  ) {
    super(`${model} unavailable (${status})`);
  }
}

export interface TranscribeOptions {
  signal?: AbortSignal;
  /** Injectable so tests drive the chain without a real model or real waiting. */
  fetchImpl?: typeof fetch;
}

export interface PageTranscription {
  text: string;
  model: string;
}

/**
 * Transcribes one page image. An empty string is a real, expected answer — a
 * blank page returns nothing rather than inventing text, which is what lets the
 * caller tell "nothing written here" from "this failed".
 */
export async function transcribePage(
  image: RawImage,
  options: TranscribeOptions = {},
): Promise<PageTranscription> {
  const doFetch = options.fetchImpl ?? fetch;
  const dataUrl = toDataUrl(encodePng(downscale(image)));
  let lastStatus: number | null = null;

  for (const model of visionChain()) {
    try {
      const text = await attempt(model, dataUrl, doFetch, options.signal);
      return { text, model };
    } catch (error) {
      if (error instanceof ModelUnavailable) {
        lastStatus = error.status;
        continue;
      }
      throw error;
    }
  }

  throw new VisionUnavailable(lastStatus);
}

async function attempt(
  model: string,
  dataUrl: string,
  doFetch: typeof fetch,
  signal?: AbortSignal,
): Promise<string> {
  const response = await doFetch(ENDPOINT, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
      "Content-Type": "application/json",
      "X-Title": "Reviewhere",
    },
    body: JSON.stringify({
      model,
      // Transcription is not a creative task; drift here is a misread word.
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: TRANSCRIBE_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) throw new ModelUnavailable(model, response.status);

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return cleanTranscription(payload.choices?.[0]?.message?.content ?? "");
}

/**
 * Models wrap output in fences or prefix it with "Here is the transcription:"
 * often enough to be worth stripping — that text would otherwise become quiz
 * source material.
 */
export function cleanTranscription(content: string): string {
  return content
    .trim()
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/```\s*$/, "")
    .replace(/^(?:here(?:'s| is) the (?:verbatim )?transcription[:.]?|transcription[:.])\s*/i, "")
    .trim();
}
