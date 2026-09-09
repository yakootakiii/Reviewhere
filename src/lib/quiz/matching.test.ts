import { describe, expect, it } from "vitest";
import { allowedEdits, checkAnswer, levenshtein, normalizeAnswer } from "./matching";
import type { Question } from "@/lib/types";

function identification(correctAnswer: string, acceptedAnswers?: string[]): Question {
  return {
    id: "q001",
    type: "identification",
    prompt: "Name it.",
    correctAnswer,
    acceptedAnswers,
    explanation: "because",
    sourcePage: 1,
    difficulty: "medium",
  };
}

const mcq: Question = {
  id: "q002",
  type: "mcq",
  prompt: "Which organelle produces ATP?",
  choices: ["Ribosome", "Mitochondrion", "Nucleus", "Golgi"],
  correctAnswer: "Mitochondrion",
  explanation: "because",
  sourcePage: 1,
  difficulty: "medium",
};

describe("normalizeAnswer", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(normalizeAnswer("  The   Mitochondria!  ")).toBe("the mitochondria");
    expect(normalizeAnswer("cell's nucleus")).toBe("cell s nucleus");
    expect(normalizeAnswer("ATP-synthase")).toBe("atp synthase");
  });

  it("keeps letters and digits from any script", () => {
    expect(normalizeAnswer("Réplication 2")).toBe("réplication 2");
  });
});

describe("allowedEdits", () => {
  it("switches band at exactly 8 characters", () => {
    expect(allowedEdits("nucleus")).toBe(1); // 7
    expect(allowedEdits("ribosome")).toBe(2); // 8
    expect(allowedEdits("mitochondria")).toBe(2);
  });
});

describe("levenshtein", () => {
  it("counts single-character edits", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("stops early once the budget is blown", () => {
    // Only the "over budget" verdict matters past the bound, not the exact number.
    expect(levenshtein("mitochondria", "photosynthesis", 2)).toBeGreaterThan(2);
  });
});

describe("checkAnswer — multiple choice", () => {
  it("accepts the correct choice regardless of case and spacing", () => {
    expect(checkAnswer("  mitochondrion ", mcq).correct).toBe(true);
  });

  it("rejects a different choice", () => {
    expect(checkAnswer("Nucleus", mcq).correct).toBe(false);
  });

  /** MCQ is a click, not a spelling test — no typo budget applies. */
  it("does not forgive a typo on a multiple-choice answer", () => {
    expect(checkAnswer("Mitochondrian", mcq).correct).toBe(false);
  });
});

describe("checkAnswer — identification", () => {
  it("accepts the exact answer", () => {
    const result = checkAnswer("Mitochondria", identification("Mitochondria"));
    expect(result).toMatchObject({ correct: true, viaTypo: false });
  });

  it("forgives one typo in a short answer", () => {
    expect(checkAnswer("nucleas", identification("nucleus")).correct).toBe(true);
  });

  it("does not forgive two typos in a short answer", () => {
    expect(checkAnswer("nuclaas", identification("nucleus")).correct).toBe(false);
  });

  it("forgives two typos once the answer is long enough", () => {
    const result = checkAnswer("mitochondrea", identification("mitochondria"));
    expect(result).toMatchObject({ correct: true, viaTypo: true });
    expect(checkAnswer("mitochondrian", identification("mitochondria")).correct).toBe(true);
  });

  it("matches an accepted variant and reports which one", () => {
    const question = identification("Mitochondria", ["mitochondrion", "the mitochondria"]);
    expect(checkAnswer("Mitochondrion", question)).toMatchObject({
      correct: true,
      matchedAnswer: "mitochondrion",
      viaTypo: false,
    });
  });

  it("applies the typo budget to accepted variants too", () => {
    const question = identification("Mitochondria", ["powerhouse organelle"]);
    expect(checkAnswer("powerhouse organele", question).correct).toBe(true);
  });

  it("counts an empty or whitespace answer as wrong", () => {
    expect(checkAnswer("", identification("nucleus")).correct).toBe(false);
    expect(checkAnswer("   ", identification("nucleus")).correct).toBe(false);
  });

  /* ------------------------------------------------------------------
   * §2.3 boundary: typo tolerance only. These must keep failing — if one
   * ever passes, the matcher has drifted into semantic matching.
   * ---------------------------------------------------------------- */

  it("rejects a synonym that is not an accepted answer", () => {
    expect(checkAnswer("powerhouse of the cell", identification("mitochondria")).correct).toBe(
      false,
    );
  });

  it("rejects a prefix or abbreviation of the answer", () => {
    expect(checkAnswer("mito", identification("mitochondria")).correct).toBe(false);
    expect(checkAnswer("adenosine", identification("adenosine triphosphate")).correct).toBe(false);
  });

  it("rejects a merely related answer", () => {
    expect(checkAnswer("chloroplast", identification("mitochondria")).correct).toBe(false);
    expect(checkAnswer("ribosome", identification("nucleus")).correct).toBe(false);
  });

  it("rejects half of a two-word answer", () => {
    expect(checkAnswer("golgi", identification("golgi apparatus")).correct).toBe(false);
  });

  /**
   * A short target with a generous-looking budget still can't swallow a
   * different short word: "cell" vs "wall" is 4 edits, not 1.
   */
  it("does not let the budget swallow a different short word", () => {
    expect(checkAnswer("wall", identification("cell")).correct).toBe(false);
  });
});
