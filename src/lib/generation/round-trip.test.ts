/**
 * The Mode B pipeline end to end on real PDF bytes: extraction → copy-ready
 * prompt → the CSV an LLM hands back → validated questions. Uses the same real
 * file fixtures as the extraction tests rather than stubbing the parsers.
 */
import { describe, expect, it } from "vitest";
import { makePdf } from "@/lib/extraction/fixtures";
import { extractPdf } from "@/lib/extraction";
import { buildModeBPrompt } from "@/lib/generation/prompt";
import { importCsv, validateCsvRow } from "@/lib/generation/csv-import";
import { interleave, dedupe } from "@/lib/generation/questions";

describe("Mode B round trip on real extracted text", () => {
  it("goes from a real PDF to saved-shaped questions, flagging the bad row", async () => {
    const pdf = makePdf([
      "Mitochondria are the powerhouse of the cell and produce ATP.",
      "Ribosomes synthesise proteins from messenger RNA.",
      "The nucleus stores the cell's DNA.",
    ]);
    const extracted = await extractPdf(pdf);
    expect(extracted.pageCount).toBe(3);

    const settings = { questionCount: 10, mcqPct: 60, difficulty: "medium" as const, scope: null };
    const { prompt } = buildModeBPrompt(extracted.pages, settings, {
      fileName: "Cell Biology.pdf",
      pageCount: extracted.pageCount,
    });
    expect(prompt).toContain("--- Page 1 ---");
    expect(prompt).toContain("Mitochondria");

    // What a real LLM would hand back, including one row that breaks the rules.
    const csv = [
      "type,question,choice_a,choice_b,choice_c,choice_d,correct_answer,accepted_answers,explanation,source_page",
      'mcq,"Which organelle produces ATP?",Ribosome,Mitochondria,Nucleus,"Golgi, apparatus",Mitochondria,,"They run oxidative phosphorylation.",1',
      'identification,"What do ribosomes build?",,,,,proteins,protein|polypeptides,"Ribosomes translate mRNA into protein.",2',
      'mcq,"Where is DNA stored?",Nucleus,Cytoplasm,,,Nucleus,,"The nucleus holds the genome.",3',
    ].join("\n");

    const result = importCsv(csv, { pageCount: 3, fallbackDifficulty: "medium" });

    expect(result.totalRows).toBe(3);
    expect(result.questions).toHaveLength(2);
    expect(result.rowErrors).toHaveLength(1);
    expect(result.rowErrors[0].rowNumber).toBe(4);

    // The quoted comma inside a choice survived RFC 4180 parsing.
    expect(result.questions[0].choices).toContain("Golgi, apparatus");
    expect(result.questions[1].acceptedAnswers).toEqual(["protein", "polypeptides"]);

    // Fixing the bad row inline clears it, exactly as the preview does.
    const fixed = { ...result.rowErrors[0].values, choice_c: "Ribosome", choice_d: "Membrane" };
    const recheck = validateCsvRow(fixed, { pageCount: 3, fallbackDifficulty: "medium" });
    expect(recheck.ok).toBe(true);

    const all = [...result.questions, ...(recheck.ok ? [recheck.question] : [])];
    const ordered = interleave(dedupe(all).kept);
    expect(ordered).toHaveLength(3);
    for (const question of ordered) {
      expect(question.explanation).not.toBe("");
      expect(question.sourcePage).toBeGreaterThan(0);
    }
  });
});
