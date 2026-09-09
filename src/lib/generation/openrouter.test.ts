import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MODEL_CHAIN,
  extractJsonArray,
  generateQuestionsForChunk,
  GenerationUnavailable,
  isOpenRouterConfigured,
  modelChain,
} from "./openrouter";
import type { TextChunk } from "./chunking";
import type { QuizSettings, ValidationContext } from "./types";

const chunk: TextChunk = {
  from: 1,
  to: 2,
  text: "--- Page 1 ---\nMitochondria make ATP.",
  quota: 2,
};
const settings: QuizSettings = {
  questionCount: 2,
  mcqPct: 50,
  difficulty: "medium",
  scope: null,
};
const context: ValidationContext = { pageCount: 10, fallbackDifficulty: "medium" };

const validQuestion = {
  type: "mcq",
  prompt: "Which organelle produces ATP?",
  choices: ["Ribosome", "Mitochondrion", "Nucleus", "Golgi"],
  correct_answer: "Mitochondrion",
  explanation: "It runs oxidative phosphorylation.",
  source_page: 1,
};

function reply(content: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers,
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_MODEL", "");
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("extractJsonArray", () => {
  it("parses a bare array", () => {
    expect(extractJsonArray('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it("survives the code fences free models like to add", () => {
    expect(extractJsonArray('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
  });

  it("digs the array out of surrounding prose", () => {
    expect(extractJsonArray('Sure! Here you go:\n[{"a":1}]\nHope that helps.')).toEqual([{ a: 1 }]);
  });

  it("unwraps an object that holds the array under a known key", () => {
    expect(extractJsonArray('{"questions":[{"a":1}]}')).toEqual([{ a: 1 }]);
  });

  /**
   * Regression: this reply shape came back from a live free model. Grabbing the
   * first array in the object turned a question's four choices into four rows.
   */
  it("does not mistake a question's choices for the list of questions", () => {
    const merged =
      '{"type":"mcq","prompt":"Which organelle makes ATP?",' +
      '"choices":["Mitochondria","Ribosome","Nucleus","Lysosome"],' +
      '"correct_answer":"Mitochondria","explanation":"It does.","source_page":1}';
    expect(extractJsonArray(merged)).toEqual([JSON.parse(merged)]);
  });

  it("ignores an object with no recognisable questions in it", () => {
    expect(extractJsonArray('{"choices":["a","b"],"note":"hi"}')).toBeNull();
  });

  it("returns null when there is no array to find", () => {
    expect(extractJsonArray("I can't help with that.")).toBeNull();
  });
});

describe("modelChain", () => {
  it("defaults to the verified free chain", () => {
    expect(modelChain()).toEqual(DEFAULT_MODEL_CHAIN);
  });

  it("puts an env override at the head without losing the fallbacks", () => {
    vi.stubEnv("OPENROUTER_MODEL", "some/other:free");
    expect(modelChain()[0]).toBe("some/other:free");
    expect(modelChain()).toHaveLength(DEFAULT_MODEL_CHAIN.length + 1);
  });

  it("reports whether a key is configured", () => {
    expect(isOpenRouterConfigured()).toBe(true);
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(isOpenRouterConfigured()).toBe(false);
  });
});

describe("generateQuestionsForChunk", () => {
  it("returns the questions that survive validation and counts the rest", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(JSON.stringify([validQuestion, { type: "mcq", prompt: "broken" }])),
    );

    const outcome = await generateQuestionsForChunk(chunk, settings, context);
    expect(outcome.questions).toHaveLength(1);
    expect(outcome.rejected).toBe(1);
    expect(outcome.retried).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once, more strictly, when the reply is unusable", async () => {
    fetchMock
      .mockResolvedValueOnce(reply("Sorry, I can't do that."))
      .mockResolvedValueOnce(reply(JSON.stringify([validQuestion])));

    const outcome = await generateQuestionsForChunk(chunk, settings, context);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(outcome.retried).toBe(true);
    expect(outcome.questions).toHaveLength(1);

    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retryBody.messages[1].content).toMatch(/ONLY a valid JSON object/);
  });

  it("gives up on the chunk after that one retry rather than looping", async () => {
    // A fresh Response each call: a Response body can only be read once.
    fetchMock.mockImplementation(async () => reply("still not JSON"));

    const outcome = await generateQuestionsForChunk(chunk, settings, context);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(outcome.questions).toEqual([]);
  });

  it("moves down the model chain when a model is rate-limited", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    fetchMock
      .mockResolvedValueOnce(reply("", 429))
      .mockResolvedValueOnce(reply(JSON.stringify([validQuestion])));

    const notices: string[] = [];
    const outcome = await generateQuestionsForChunk(chunk, settings, context, {
      sleep,
      onNotice: (message) => notices.push(message),
    });

    expect(outcome.model).toBe(DEFAULT_MODEL_CHAIN[1]);
    expect(notices).toContain("Still generating, this may take a bit longer.");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("waits and retries the same model when Retry-After is short", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    fetchMock
      .mockResolvedValueOnce(reply("", 429, { "retry-after": "2" }))
      .mockResolvedValueOnce(reply(JSON.stringify([validQuestion])));

    const outcome = await generateQuestionsForChunk(chunk, settings, context, { sleep });

    expect(sleep).toHaveBeenCalledWith(2000);
    expect(outcome.model).toBe(DEFAULT_MODEL_CHAIN[0]);
  });

  it("fails loudly only after every model in the chain is unavailable", async () => {
    fetchMock.mockImplementation(async () => reply("", 503));
    await expect(
      generateQuestionsForChunk(chunk, settings, context, { sleep: async () => {} }),
    ).rejects.toBeInstanceOf(GenerationUnavailable);
    expect(fetchMock).toHaveBeenCalledTimes(DEFAULT_MODEL_CHAIN.length);
  });
});
