import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { ExtractionError, type ExtractedPage, type ExtractionResult } from "./types";
import { summarize } from "./summarize";

/**
 * A .pptx is a zip of XML parts. Slide N lives at ppt/slides/slideN.xml and its
 * speaker notes at ppt/notesSlides/notesSlideN.xml; visible text in both is the
 * <a:t> runs. Notes are included because lecture decks often carry the real
 * explanation there rather than on the slide.
 */
const SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/;
const NOTES_PATH = /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/;

const parser = new XMLParser({
  ignoreAttributes: true,
  // A slide with one text run must still parse as a list, not a bare object.
  isArray: () => false,
});

export async function extractPptx(data: Uint8Array): Promise<ExtractionResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch (cause) {
    throw new ExtractionError(
      "We couldn't open this PowerPoint file. It may be corrupted.",
      cause,
    );
  }

  const slideFiles = collect(zip, SLIDE_PATH);
  const notesFiles = collect(zip, NOTES_PATH);

  if (slideFiles.size === 0) {
    throw new ExtractionError(
      "This file doesn't contain any slides. If it's an older .ppt file, save it as .pptx and try again.",
    );
  }

  const slideNumbers = [...slideFiles.keys()].sort((a, b) => a - b);
  const pages: ExtractedPage[] = [];

  for (const [index, slideNumber] of slideNumbers.entries()) {
    const slideXml = await slideFiles.get(slideNumber)!.async("string");
    const notesFile = notesFiles.get(slideNumber);
    const notesXml = notesFile ? await notesFile.async("string") : null;

    const slideText = textRuns(slideXml).join("\n");
    const notesText = notesXml ? textRuns(notesXml).join("\n") : "";

    pages.push({
      // Renumber sequentially: slideN.xml numbering has gaps when slides are
      // deleted, but sourcePage must line up with what the user sees.
      page: index + 1,
      text: notesText ? `${slideText}\n\nSpeaker notes:\n${notesText}`.trim() : slideText.trim(),
    });
  }

  return summarize(pages, pages.length);
}

function collect(zip: JSZip, pattern: RegExp) {
  const found = new Map<number, JSZip.JSZipObject>();
  for (const [path, file] of Object.entries(zip.files)) {
    const match = pattern.exec(path);
    if (match) found.set(Number(match[1]), file);
  }
  return found;
}

/** Walk the parsed tree collecting every <a:t> value, in document order. */
function textRuns(xml: string): string[] {
  let tree: unknown;
  try {
    tree = parser.parse(xml);
  } catch {
    return [];
  }

  const runs: string[] = [];
  const visit = (node: unknown) => {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object") return;

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "a:t") {
        // fast-xml-parser coerces numeric-looking text, so stringify defensively.
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) {
          if (item !== null && item !== undefined && typeof item !== "object") {
            runs.push(String(item));
          }
        }
      } else {
        visit(value);
      }
    }
  };

  visit(tree);
  return runs;
}
