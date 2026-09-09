import { describe, expect, it } from "vitest";
import {
  dedupe,
  interleave,
  questionDocId,
  selectForQuota,
  validateQuestionRow,
} from "./questions";
import type { QuestionDraft, ValidationContext } from "./types";

const context: ValidationContext = { pageCount: 40, fallbackDifficulty: "medium" };

const mcqRow = {
  type: "mcq",
  question: "Which organelle produces ATP?",
  choice_a: "Ribosome",
  choice_b: "Mitochondrion",
  choice_c: "Nucleus",
  choice_d: "Golgi apparatus",
  correct_answer: "Mitochondrion",
  accepted_answers: "",
  explanation: "The mitochondrion is the site of oxidative phosphorylation.",
  source_page: "12",
};

describe("validateQuestionRow", () => {
  it("accepts a well-formed MCQ row", () => {
    const result = validateQuestionRow(mcqRow, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.question.choices).toHaveLength(4);
    expect(result.question.correctAnswer).toBe("Mitochondrion");
    expect(result.question.sourcePage).toBe(12);
    expect(result.question.difficulty).toBe("medium");
  });

  it("resolves a letter answer to the choice text it points at", () => {
    const result = validateQuestionRow({ ...mcqRow, correct_answer: "B" }, context);
    expect(result.ok && result.question.correctAnswer).toBe("Mitochondrion");
  });

  it("rejects an MCQ answer that matches none of the choices", () => {
    const result = validateQuestionRow({ ...mcqRow, correct_answer: "Lysosome" }, context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/doesn't match any of the four choices/);
  });

  it("rejects an MCQ row missing a choice, reporting how many it found", () => {
    const result = validateQuestionRow({ ...mcqRow, choice_d: "" }, context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/need all 4 choices — this row has 3/);
  });

  it("splits pipe-separated accepted answers for identification", () => {
    const result = validateQuestionRow(
      {
        type: "identification",
        question: "Name the powerhouse of the cell.",
        correct_answer: "Mitochondria",
        accepted_answers: "mitochondrion|Mitochondria|the mitochondria",
        explanation: "Both spellings are in common use.",
        source_page: "12",
      },
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The correct answer isn't repeated in the variants, and case-dupes collapse.
    expect(result.question.acceptedAnswers).toEqual(["mitochondrion", "the mitochondria"]);
    expect(result.question.choices).toBeUndefined();
  });

  it("rejects an identification row that filled in the choice columns", () => {
    const result = validateQuestionRow(
      {
        type: "identification",
        question: "Name the powerhouse of the cell.",
        choice_a: "Mitochondria",
        correct_answer: "Mitochondria",
        explanation: "…",
        source_page: "3",
      },
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/leave the four choice columns blank/);
  });

  it("rejects an unknown type and names it back to the user", () => {
    const result = validateQuestionRow({ ...mcqRow, type: "true_false" }, context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/Unknown type "true_false"/);
  });

  it("requires an explanation on every question", () => {
    const result = validateQuestionRow({ ...mcqRow, explanation: "  " }, context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("Missing an explanation — every question needs one.");
  });

  it("requires a source page inside the document", () => {
    const missing = validateQuestionRow({ ...mcqRow, source_page: "" }, context);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors).toContain("Missing the source page number.");

    const beyond = validateQuestionRow({ ...mcqRow, source_page: "99" }, context);
    expect(beyond.ok).toBe(false);
    if (!beyond.ok) expect(beyond.errors[0]).toMatch(/outside this document, which has 40 pages/);
  });

  it("reports every problem with a row at once, not just the first", () => {
    const result = validateQuestionRow({ type: "mcq" }, context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(2);
  });

  it("falls back to the quiz difficulty when the row doesn't carry one", () => {
    const result = validateQuestionRow(mcqRow, { ...context, fallbackDifficulty: "hard" });
    expect(result.ok && result.question.difficulty).toBe("hard");
  });

  /**
   * The load-bearing guarantee of §2.2: the same question reaches the same
   * stored shape whether it arrived as Mode A JSON or a Mode B CSV row.
   */
  it("produces an identical question from Mode A JSON and the equivalent CSV row", () => {
    const fromModeA = validateQuestionRow(
      {
        type: "mcq",
        prompt: "Which organelle produces ATP?",
        choices: ["Ribosome", "Mitochondrion", "Nucleus", "Golgi apparatus"],
        correct_answer: "Mitochondrion",
        explanation: "The mitochondrion is the site of oxidative phosphorylation.",
        source_page: 12,
      },
      context,
    );
    const fromCsv = validateQuestionRow(mcqRow, context);

    expect(fromModeA.ok && fromCsv.ok).toBe(true);
    if (!fromModeA.ok || !fromCsv.ok) return;
    expect(fromModeA.question).toEqual(fromCsv.question);
  });
});

function draft(type: QuestionDraft["type"], prompt: string): QuestionDraft {
  return {
    type,
    ...(type === "mcq" ? { choices: ["a", "b", "c", "d"] } : {}),
    prompt,
    correctAnswer: "a",
    explanation: "because",
    sourcePage: 1,
    difficulty: "medium",
  };
}

describe("dedupe", () => {
  it("drops repeats that differ only by case, spacing or punctuation", () => {
    const result = dedupe([
      draft("mcq", "What is ATP?"),
      draft("mcq", "what  is atp"),
      draft("mcq", "What is DNA?"),
    ]);
    expect(result.kept).toHaveLength(2);
    expect(result.duplicates).toBe(1);
  });

  it("keeps the same prompt asked as both question types", () => {
    const result = dedupe([draft("mcq", "What is ATP?"), draft("identification", "What is ATP?")]);
    expect(result.kept).toHaveLength(2);
  });
});

describe("interleave", () => {
  it("spreads the smaller group through the larger one instead of grouping", () => {
    const questions = [
      ...Array.from({ length: 6 }, (_, index) => draft("mcq", `m${index}`)),
      ...Array.from({ length: 4 }, (_, index) => draft("identification", `i${index}`)),
    ];
    const types = interleave(questions).map((question) => question.type[0]).join("");

    expect(types).toHaveLength(10);
    // No type may run three deep — that would read as grouped, not interleaved.
    expect(types).not.toMatch(/mmm|iii/);
  });

  it("leaves a single-type quiz untouched", () => {
    const questions = [draft("mcq", "a"), draft("mcq", "b")];
    expect(interleave(questions)).toEqual(questions);
  });
});

describe("questionDocId", () => {
  it("zero-pads so id order is question order", () => {
    const ids = [questionDocId(0), questionDocId(8), questionDocId(9), questionDocId(11)];
    expect(ids).toEqual(["q001", "q009", "q010", "q012"]);
    expect([...ids].sort()).toEqual(ids);
  });
});

describe("selectForQuota", () => {
  const pool = [
    ...Array.from({ length: 8 }, (_, index) => draft("mcq", `m${index}`)),
    ...Array.from({ length: 8 }, (_, index) => draft("identification", `i${index}`)),
  ];

  it("trims an over-delivering pool back to the requested mix", () => {
    const selected = selectForQuota(pool, { mcq: 6, identification: 4 });
    expect(selected).toHaveLength(10);
    expect(selected.filter((question) => question.type === "mcq")).toHaveLength(6);
  });

  it("covers a shortfall in one type with the other rather than returning short", () => {
    const lopsided = [
      ...Array.from({ length: 9 }, (_, index) => draft("mcq", `m${index}`)),
      draft("identification", "i0"),
    ];
    const selected = selectForQuota(lopsided, { mcq: 6, identification: 4 });
    expect(selected).toHaveLength(10);
  });

  it("returns everything it has when the pool is genuinely too small", () => {
    const selected = selectForQuota(pool.slice(0, 3), { mcq: 6, identification: 4 });
    expect(selected).toHaveLength(3);
  });
});
