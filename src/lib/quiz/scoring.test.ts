import { describe, expect, it } from "vitest";
import { formatDuration, scoreAttempt } from "./scoring";
import {
  answeredCount,
  createSession,
  goToIndex,
  incorrectQuestionIds,
  isComplete,
  isUsableSession,
  recordAnswer,
  revealAnswer,
} from "./session";
import type { Attempt, Question } from "@/lib/types";

function mcq(id: string): Question {
  return {
    id,
    type: "mcq",
    prompt: `Question ${id}`,
    choices: ["Right", "Wrong A", "Wrong B", "Wrong C"],
    correctAnswer: "Right",
    explanation: "because",
    sourcePage: 1,
    difficulty: "medium",
  };
}

function identification(id: string): Question {
  return {
    id,
    type: "identification",
    prompt: `Question ${id}`,
    correctAnswer: "mitochondria",
    explanation: "because",
    sourcePage: 2,
    difficulty: "medium",
  };
}

const questions = [mcq("q001"), identification("q002"), mcq("q003"), identification("q004")];

function sessionWith(answers: Record<string, string>) {
  return {
    ...createSession("quiz-1", questions.map((question) => question.id)),
    answers,
  };
}

describe("scoreAttempt", () => {
  it("scores a perfect attempt", () => {
    const result = scoreAttempt(
      questions,
      sessionWith({ q001: "Right", q002: "mitochondria", q003: "Right", q004: "mitochondria" }),
    );
    expect(result.score).toBe(100);
    expect(result.correctCount).toBe(4);
  });

  it("scores an attempt that got everything wrong", () => {
    const result = scoreAttempt(questions, sessionWith({ q001: "Wrong A", q002: "nucleus" }));
    expect(result.score).toBe(0);
    expect(result.correctCount).toBe(0);
  });

  it("counts unanswered questions as wrong rather than excluding them", () => {
    // Answering only one of four is 25%, not 100%.
    const result = scoreAttempt(questions, sessionWith({ q001: "Right" }));
    expect(result.score).toBe(25);
    expect(result.answers.filter((answer) => answer.userAnswer === "")).toHaveLength(3);
  });

  it("breaks the score down by question type", () => {
    const result = scoreAttempt(
      questions,
      sessionWith({ q001: "Right", q002: "mitochondria", q003: "Wrong A", q004: "nucleus" }),
    );
    expect(result.byType.mcq).toEqual({ correct: 1, total: 2 });
    expect(result.byType.identification).toEqual({ correct: 1, total: 2 });
  });

  it("credits an identification answer that only had a typo", () => {
    const result = scoreAttempt(questions, sessionWith({ q002: "mitochondrea" }));
    expect(result.answers.find((answer) => answer.questionId === "q002")?.isCorrect).toBe(true);
  });

  it("rounds the percentage to a whole number", () => {
    const three = questions.slice(0, 3);
    const result = scoreAttempt(three, sessionWith({ q001: "Right" }));
    expect(result.score).toBe(33);
  });

  it("carries per-question time into the attempt answers", () => {
    const session = { ...sessionWith({ q001: "Right" }), seconds: { q001: 12 } };
    const result = scoreAttempt(questions, session);
    expect(result.answers[0].timeSpentSec).toBe(12);
  });

  it("handles an empty quiz without dividing by zero", () => {
    expect(scoreAttempt([], sessionWith({})).score).toBe(0);
  });
});

describe("session", () => {
  const ids = questions.map((question) => question.id);

  it("tracks progress and completion", () => {
    const session = sessionWith({ q001: "Right", q002: "  " });
    expect(answeredCount(session)).toBe(1);
    expect(isComplete(session)).toBe(false);

    const done = sessionWith({ q001: "a", q002: "b", q003: "c", q004: "d" });
    expect(isComplete(done)).toBe(true);
  });

  it("accepts a stored session that still matches the quiz", () => {
    expect(isUsableSession(createSession("quiz-1", ids), "quiz-1", ids)).toBe(true);
  });

  it("rejects a session from another quiz", () => {
    expect(isUsableSession(createSession("quiz-2", ids), "quiz-1", ids)).toBe(false);
  });

  it("rejects a stale session whose questions no longer exist", () => {
    const stale = createSession("quiz-1", ["q001", "gone"]);
    expect(isUsableSession(stale, "quiz-1", ids)).toBe(false);
    expect(isUsableSession(null, "quiz-1", ids)).toBe(false);
  });

  it("keeps a subset session usable, for retaking the missed questions", () => {
    expect(isUsableSession(createSession("quiz-1", ["q002"]), "quiz-1", ids)).toBe(true);
  });
});

describe("incorrectQuestionIds", () => {
  it("selects exactly the questions an attempt got wrong", () => {
    const attempt = {
      answers: [
        { questionId: "q001", userAnswer: "Right", isCorrect: true, timeSpentSec: 3 },
        { questionId: "q002", userAnswer: "nucleus", isCorrect: false, timeSpentSec: 9 },
        { questionId: "q003", userAnswer: "", isCorrect: false, timeSpentSec: 0 },
      ],
    } as Attempt;
    expect(incorrectQuestionIds(attempt)).toEqual(["q002", "q003"]);
  });
});

describe("formatDuration", () => {
  it("reads naturally under and over a minute", () => {
    expect(formatDuration(42)).toBe("42s");
    expect(formatDuration(60)).toBe("1m 00s");
    expect(formatDuration(154)).toBe("2m 34s");
  });
});

describe("session reducers", () => {
  const base = createSession("quiz-1", questions.map((question) => question.id));

  it("records an answer", () => {
    const next = recordAnswer(base, "q001", "Right", true, 5);
    expect(next.answers.q001).toBe("Right");
    expect(next.seconds.q001).toBe(5);
    expect(next.wrongTries.q001).toBeUndefined();
  });

  it("counts a wrong try without overwriting the first answer", () => {
    const first = recordAnswer(base, "q002", "nucleus", false, 4);
    const second = recordAnswer(first, "q002", "mitochondria", true, 3);

    expect(second.answers.q002).toBe("nucleus");
    expect(second.wrongTries.q002).toBe(1);
    expect(second.seconds.q002).toBe(7);
  });

  /**
   * Regression: recording an answer and advancing used to be two spreads of the
   * same stale session object, so the navigation write clobbered the answer and
   * every end-of-quiz-mode attempt scored 0%. Composed reducers cannot do that.
   */
  it("keeps the answer when the very next action is advancing", () => {
    const answered = recordAnswer(base, "q001", "Right", true, 5);
    const advanced = goToIndex(answered, 1);

    expect(advanced.answers.q001).toBe("Right");
    expect(advanced.index).toBe(1);
  });

  it("keeps every answer across a full run of answer-then-advance", () => {
    let session = base;
    questions.forEach((question, index) => {
      session = recordAnswer(session, question.id, "Right", true, 1);
      session = goToIndex(session, index + 1);
    });

    expect(Object.keys(session.answers)).toHaveLength(questions.length);
    // The score is what the user actually sees go wrong.
    expect(scoreAttempt(questions, session).answers.every((a) => a.userAnswer !== "")).toBe(true);
  });

  it("clamps navigation to the questions in play", () => {
    expect(goToIndex(base, -5).index).toBe(0);
    expect(goToIndex(base, 99).index).toBe(questions.length - 1);
  });

  it("reveals an answer once and is idempotent", () => {
    const once = revealAnswer(base, "q002");
    expect(once.revealed).toEqual(["q002"]);
    expect(revealAnswer(once, "q002")).toBe(once);
  });
});
