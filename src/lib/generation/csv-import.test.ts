import { describe, expect, it } from "vitest";
import { CSV_HEADER, describeImport, importCsv } from "./csv-import";
import { GenerationError, type ValidationContext } from "./types";

const context: ValidationContext = { pageCount: 40, fallbackDifficulty: "mixed" };
const header = CSV_HEADER.join(",");

const goodMcq =
  'mcq,"Which organelle produces ATP?",Ribosome,Mitochondrion,Nucleus,Golgi,Mitochondrion,,"Site of oxidative phosphorylation.",12';
const goodIdentification =
  'identification,"Name the powerhouse of the cell.",,,,,Mitochondria,mitochondrion|mitochondria,"Both spellings are accepted.",12';

describe("importCsv", () => {
  it("imports a clean file and counts the mix", () => {
    const result = importCsv([header, goodMcq, goodIdentification].join("\n"), context);

    expect(result.rowErrors).toEqual([]);
    expect(result.questions).toHaveLength(2);
    expect(result.mcqCount).toBe(1);
    expect(result.identificationCount).toBe(1);
    expect(describeImport(result)).toBe(
      "2 questions detected — 1 multiple choice, 1 identification",
    );
  });

  it("surfaces bad rows instead of dropping them, keeping the good ones", () => {
    const bad = 'mcq,"Missing a choice",A,B,C,,A,,"why",3';
    const result = importCsv([header, goodMcq, bad, goodIdentification].join("\n"), context);

    expect(result.questions).toHaveLength(2);
    expect(result.totalRows).toBe(3);
    expect(result.rowErrors).toHaveLength(1);
    // Row 3 of the file: header is row 1, the good MCQ is row 2.
    expect(result.rowErrors[0].rowNumber).toBe(3);
    expect(result.rowErrors[0].errors[0]).toMatch(/need all 4 choices/);
  });

  it("hands the failing row's values back so the preview can edit them in place", () => {
    const bad = 'true_false,"Is ATP energy?",,,,,yes,,"because",3';
    const result = importCsv([header, bad].join("\n"), context);

    expect(result.rowErrors[0].values).toMatchObject({
      type: "true_false",
      question: "Is ATP energy?",
      correct_answer: "yes",
      source_page: "3",
    });
  });

  it("flags a source page beyond the document", () => {
    const bad = goodMcq.replace(/,12$/, ",412");
    const result = importCsv([header, bad].join("\n"), context);
    expect(result.rowErrors[0].errors[0]).toMatch(/outside this document/);
  });

  it("ignores blank padding rows from spreadsheet exports", () => {
    const result = importCsv([header, goodMcq, ",,,,,,,,,", ""].join("\n"), context);
    expect(result.totalRows).toBe(1);
    expect(result.rowErrors).toEqual([]);
  });

  it("accepts the header in any order and ignores extra columns", () => {
    const reordered = "source_page,type,question,choice_a,choice_b,choice_c,choice_d,correct_answer,accepted_answers,explanation,notes";
    const row = '12,mcq,"Which organelle produces ATP?",Ribosome,Mitochondrion,Nucleus,Golgi,Mitochondrion,,"Because.",ignored';
    const result = importCsv([reordered, row].join("\n"), context);
    expect(result.questions).toHaveLength(1);
  });

  it("rejects a file whose header isn't the contract, showing the expected one", () => {
    expect(() => importCsv("question,answer\nfoo,bar", context)).toThrowError(GenerationError);
    expect(() => importCsv("question,answer\nfoo,bar", context)).toThrowError(
      new RegExp(CSV_HEADER.join(",")),
    );
  });

  it("rejects an empty paste", () => {
    expect(() => importCsv("   ", context)).toThrowError(/empty/i);
  });
});
