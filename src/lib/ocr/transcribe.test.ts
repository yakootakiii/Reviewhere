import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  cleanTranscription,
  DEFAULT_VISION_CHAIN,
  transcribePage,
  visionChain,
  VisionUnavailable,
} from "./transcribe";
import type { RawImage } from "./png";

/** A page-sized block of pixels; the content doesn't matter to these tests. */
function page(): RawImage {
  return { data: new Uint8ClampedArray(300 * 300 * 3), width: 300, height: 300, channels: 3 };
}

function reply(content: string) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as unknown as Response;
}

function unavailable(status: number) {
  return { ok: false, status } as unknown as Response;
}

/** The JSON body of the nth call, which is what these assertions are about. */
function sentBody(mock: Mock<typeof fetch>, call = 0) {
  return JSON.parse(String(mock.mock.calls[call]?.[1]?.body));
}

let fetchImpl: Mock<typeof fetch>;

beforeEach(() => {
  fetchImpl = vi.fn<typeof fetch>();
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("visionChain", () => {
  it("uses the verified free chain by default", () => {
    expect(visionChain()).toEqual(DEFAULT_VISION_CHAIN);
  });

  it("puts an override at the head without dropping the fallbacks", () => {
    vi.stubEnv("OPENROUTER_VISION_MODEL", "someone/new-vision:free");
    expect(visionChain()[0]).toBe("someone/new-vision:free");
    expect(visionChain()).toHaveLength(DEFAULT_VISION_CHAIN.length + 1);
  });

  it("doesn't list a model twice when the override is already in the chain", () => {
    vi.stubEnv("OPENROUTER_VISION_MODEL", DEFAULT_VISION_CHAIN[1]);
    const chain = visionChain();
    expect(chain[0]).toBe(DEFAULT_VISION_CHAIN[1]);
    expect(new Set(chain).size).toBe(chain.length);
  });
});

describe("transcribePage", () => {
  it("sends the image as a data URL alongside the prompt", async () => {
    fetchImpl.mockResolvedValueOnce(reply("Glycolysis happens in the cytoplasm."));
    const result = await transcribePage(page(), { fetchImpl });

    const body = sentBody(fetchImpl);
    expect(body.model).toBe(DEFAULT_VISION_CHAIN[0]);
    // Transcription is not a creative task; drift is a misread word.
    expect(body.temperature).toBe(0);

    const [prompt, image] = body.messages[0].content;
    expect(prompt.type).toBe("text");
    expect(image.type).toBe("image_url");
    expect(image.image_url.url.startsWith("data:image/png;base64,")).toBe(true);
    expect(result.text).toBe("Glycolysis happens in the cytoplasm.");
    expect(result.model).toBe(DEFAULT_VISION_CHAIN[0]);
  });

  it("walks down the chain when a model is unavailable", async () => {
    fetchImpl
      .mockResolvedValueOnce(unavailable(429))
      .mockResolvedValueOnce(reply("Krebs cycle -> matrix"));

    const result = await transcribePage(page(), { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.model).toBe(DEFAULT_VISION_CHAIN[1]);
  });

  it("gives up with VisionUnavailable once the whole chain is exhausted", async () => {
    fetchImpl.mockResolvedValue(unavailable(503));
    await expect(transcribePage(page(), { fetchImpl })).rejects.toBeInstanceOf(VisionUnavailable);
    expect(fetchImpl).toHaveBeenCalledTimes(DEFAULT_VISION_CHAIN.length);
  });

  it("treats an empty reply as a blank page, not a failure", async () => {
    // Verified against the live models: a blank page comes back empty rather
    // than hallucinated, which is what lets the caller tell the two apart.
    fetchImpl.mockResolvedValueOnce(reply(""));
    const result = await transcribePage(page(), { fetchImpl });
    expect(result.text).toBe("");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("downscales an oversized scan before sending it", async () => {
    fetchImpl.mockResolvedValueOnce(reply("ok"));
    const huge: RawImage = {
      data: new Uint8ClampedArray(3000 * 100 * 3),
      width: 3000,
      height: 100,
      channels: 3,
    };
    await transcribePage(huge, { fetchImpl });

    const body = sentBody(fetchImpl);
    const png = Buffer.from(body.messages[0].content[1].image_url.url.split(",")[1], "base64");
    // IHDR width sits at a fixed offset in a PNG we wrote ourselves.
    expect(png.readUInt32BE(16)).toBe(1600);
  });
});

describe("cleanTranscription", () => {
  it("strips code fences a model wrapped the page in", () => {
    expect(cleanTranscription("```\nCalvin cycle = stroma\n```")).toBe("Calvin cycle = stroma");
  });

  it("strips a conversational preamble that would become quiz material", () => {
    expect(cleanTranscription("Here is the transcription:\nATP + NADPH")).toBe("ATP + NADPH");
  });

  it("leaves ordinary notes untouched, brackets and arrows included", () => {
    const notes = "3 turns -> 1 G3P\n[diagram: light rxns feeding the Calvin cycle]\n[?] plants";
    expect(cleanTranscription(notes)).toBe(notes);
  });
});
