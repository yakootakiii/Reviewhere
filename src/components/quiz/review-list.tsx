"use client";

import { checkAnswer } from "@/lib/quiz/matching";
import { cn } from "@/lib/utils";
import type { AttemptAnswer, Question } from "@/lib/types";

/**
 * §2.5's review list: every question with the user's answer, the right answer,
 * the explanation and a pointer back to the source page. Shared by the results
 * screen and any past attempt.
 */
export function ReviewList({
  questions,
  answers,
  documentId,
}: {
  questions: Question[];
  answers: AttemptAnswer[];
  documentId?: string;
}) {
  const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));

  return (
    <ol className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
      {questions.map((question, index) => {
        const answer = byQuestion.get(question.id);
        const correct = answer?.isCorrect ?? false;
        const given = (answer?.userAnswer ?? "").trim();
        // Re-checking here tells the review screen *why* a typo'd answer passed.
        const viaTypo = given ? checkAnswer(given, question).viaTypo : false;

        return (
          <li key={question.id} className="flex flex-col gap-3 py-6">
              <div className="flex items-start justify-between gap-3">
                <span className="text-caption text-tertiary">
                  {index + 1} · {question.type === "mcq" ? "Multiple choice" : "Identification"}
                </span>
                <span
                  className={cn(
                    "text-caption",
                    correct ? "text-[var(--color-success)]" : "text-[var(--color-error)]",
                  )}
                >
                  {correct ? "Correct" : "Incorrect"}
                </span>
              </div>

              <p className="max-w-[68ch] text-body">{question.prompt}</p>

              {question.choices && (
                <ul className="flex max-w-[68ch] flex-col gap-1.5">
                  {question.choices.map((choice) => {
                    const isAnswer = choice === question.correctAnswer;
                    const isChoice = given.toLowerCase() === choice.toLowerCase();
                    return (
                      <li
                        key={choice}
                        className={cn(
                          "rounded-sm border-l-2 py-1 pl-3 text-callout",
                          isAnswer
                            ? "border-[var(--color-success)]"
                            : isChoice
                              ? "border-[var(--color-error)]"
                              : "border-transparent text-secondary",
                        )}
                      >
                        {choice}
                        {isChoice && !isAnswer && (
                          <span className="text-caption text-secondary"> · your answer</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {question.type === "identification" && (
                <div className="flex max-w-[68ch] flex-col gap-1 text-callout">
                  <p>
                    <span className="text-secondary">Your answer: </span>
                    {given ? (
                      <span className={correct ? undefined : "text-[var(--color-error)]"}>
                        {given}
                      </span>
                    ) : (
                      <span className="text-tertiary">skipped</span>
                    )}
                    {viaTypo && correct && (
                      <span className="text-caption text-tertiary"> · accepted despite a typo</span>
                    )}
                  </p>
                  <p>
                    <span className="text-secondary">Correct answer: </span>
                    {question.correctAnswer}
                    {question.acceptedAnswers && question.acceptedAnswers.length > 0 && (
                      <span className="text-caption text-tertiary">
                        {" "}
                        (also accepts {question.acceptedAnswers.join(", ")})
                      </span>
                    )}
                  </p>
                </div>
              )}

              <p className="max-w-[68ch] text-callout text-secondary">{question.explanation}</p>

              {question.sourcePage !== null && (
                <p className="text-caption text-tertiary">
                  {documentId ? (
                    <a
                      href={`/documents/${documentId}`}
                      className="rounded underline underline-offset-2 hover:text-secondary"
                    >
                      From page {question.sourcePage}
                    </a>
                  ) : (
                    <>From page {question.sourcePage}</>
                  )}
                </p>
              )}
          </li>
        );
      })}
    </ol>
  );
}
