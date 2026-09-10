"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnswerFeedback } from "./answer-feedback";
import { ProgressSteps } from "./progress-steps";
import { QuestionCard } from "./question-card";
import { checkAnswer } from "@/lib/quiz/matching";
import { formatDuration } from "@/lib/quiz/scoring";
import {
  answeredCount,
  elapsedSeconds,
  goToIndex,
  recordAnswer,
  revealAnswer,
  type QuizSession,
} from "@/lib/quiz/session";
import type { FeedbackMode, Question } from "@/lib/types";

/**
 * Owns an in-progress sitting (§2.4). Each question is rendered by a `key`ed
 * stage below so its draft state resets on navigation without an effect syncing
 * props into state — `react-hooks/set-state-in-effect` is an error in this repo.
 */
export function QuizRunner({
  questions,
  session,
  onSession,
  feedbackMode,
  timerEnabled,
  onFinish,
  finishing,
}: {
  questions: Question[];
  session: QuizSession;
  /**
   * Functional on purpose: recording an answer and advancing happen in the same
   * handler, and two updates built from one render's `session` would clobber
   * each other — which scored every end-of-quiz-mode attempt 0%.
   */
  onSession: (update: (previous: QuizSession) => QuizSession) => void;
  feedbackMode: FeedbackMode;
  timerEnabled: boolean;
  /** Reads the finished session from the store itself, never from a closure. */
  onFinish: () => void;
  finishing: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const index = Math.min(session.index, questions.length - 1);
  const question = questions[index];
  const isLast = index === questions.length - 1;

  const [elapsed, setElapsed] = useState(() => elapsedSeconds(session));

  useEffect(() => {
    if (!timerEnabled) return;
    const id = setInterval(() => setElapsed(elapsedSeconds(session)), 1000);
    return () => clearInterval(id);
  }, [timerEnabled, session]);

  const record = useCallback(
    (answer: string, seconds: number) => {
      const correct = checkAnswer(answer, question).correct;
      onSession((previous) => recordAnswer(previous, question.id, answer, correct, seconds));
    },
    [question, onSession],
  );

  const reveal = useCallback(() => {
    onSession((previous) => revealAnswer(previous, question.id));
  }, [question.id, onSession]);

  /**
   * Steps relative to the *stored* index rather than this render's. During the
   * card transition the outgoing question is briefly still mounted with its old
   * handlers; an absolute index from that closure would jump the quiz backwards.
   */
  const step = useCallback(
    (delta: number) => {
      onSession((previous) => goToIndex(previous, previous.index + delta));
    },
    [onSession],
  );

  const answered = new Set(
    questions
      .map((entry, position) => (session.answers[entry.id] !== undefined ? position : -1))
      .filter((position) => position >= 0),
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-caption text-secondary tabular-nums">
            {answeredCount(session)} of {questions.length} answered
          </span>
          {timerEnabled && (
            <span className="inline-flex items-center gap-1.5 text-caption text-secondary tabular-nums">
              <Clock aria-hidden className="size-3.5" />
              {formatDuration(elapsed)}
            </span>
          )}
        </div>
        <ProgressSteps total={questions.length} current={index} answered={answered} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={question.id}
          // A cross-fade, not a slide: moving the question sideways makes the
          // reader chase it, and adds nothing they need to know.
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          // The exiting card stays mounted until its animation ends; without this
          // a fast second click can land on the question you just left.
          exit={{ opacity: 0, pointerEvents: "none" }}
          transition={{ duration: reduceMotion ? 0.1 : 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          <QuestionStage
            key={question.id}
            question={question}
            index={index}
            total={questions.length}
            isLast={isLast}
            feedbackMode={feedbackMode}
            finishing={finishing}
            recordedAnswer={session.answers[question.id]}
            wrongTries={session.wrongTries[question.id] ?? 0}
            revealed={session.revealed.includes(question.id)}
            onRecord={record}
            onReveal={reveal}
            onBack={index > 0 ? () => step(-1) : undefined}
            onAdvance={() => (isLast ? onFinish() : step(1))}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function QuestionStage({
  question,
  index,
  total,
  isLast,
  feedbackMode,
  finishing,
  recordedAnswer,
  wrongTries,
  revealed,
  onRecord,
  onReveal,
  onBack,
  onAdvance,
}: {
  question: Question;
  index: number;
  total: number;
  isLast: boolean;
  feedbackMode: FeedbackMode;
  finishing: boolean;
  recordedAnswer: string | undefined;
  wrongTries: number;
  revealed: boolean;
  onRecord: (answer: string, seconds: number) => void;
  onReveal: () => void;
  onBack?: () => void;
  onAdvance: () => void;
}) {
  // Fresh per question because the parent keys this component by question id.
  const shownAt = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(recordedAnswer ?? "");
  const [checked, setChecked] = useState(
    // Revisiting an answered question shows its verdict rather than a blank slate.
    recordedAnswer !== undefined && feedbackMode === "immediate",
  );

  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  const immediate = feedbackMode === "immediate";
  const correct = checked ? checkAnswer(draft, question).correct : false;
  const canSubmit = draft.trim() !== "" && !finishing;

  const submit = useCallback(() => {
    if (!canSubmit) return;
    const now = Date.now();
    const seconds = Math.round((now - (shownAt.current ?? now)) / 1000);
    shownAt.current = now;
    onRecord(draft, seconds);
    if (immediate) setChecked(true);
    else onAdvance();
  }, [canSubmit, draft, immediate, onRecord, onAdvance]);

  const primaryAction = useCallback(() => {
    if (immediate && checked) onAdvance();
    // "Finish" should always finish. Without this the last question shows a
    // greyed-out Finish when it's unanswered, and only Skip ends the quiz.
    else if (isLast && !canSubmit) onAdvance();
    else submit();
  }, [immediate, checked, isLast, canSubmit, onAdvance, submit]);

  // §6: 1–4 pick a choice, Enter moves on. Digits must not fire while the
  // identification field has focus, or the answer becomes untypeable.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const typing =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement;

      if (event.key === "Enter") {
        // The text field submits through its own handler.
        if (typing) return;
        event.preventDefault();
        primaryAction();
        return;
      }

      if (typing || question.type !== "mcq" || !question.choices) return;
      const slot = Number(event.key);
      if (Number.isInteger(slot) && slot >= 1 && slot <= question.choices.length) {
        event.preventDefault();
        if (!(immediate && checked)) setDraft(question.choices[slot - 1]);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [question, immediate, checked, primaryAction]);

  const locked = immediate && checked && (correct || revealed || question.type === "mcq");

  return (
    <div className="flex flex-col gap-7">
      <QuestionCard
        question={question}
        index={index}
        total={total}
        selected={question.type === "mcq" ? draft || null : null}
        onSelect={setDraft}
        textAnswer={draft}
        onTextChange={setDraft}
        onSubmit={primaryAction}
        locked={locked}
        inputRef={inputRef}
      />

      {immediate && checked && (
        <AnswerFeedback
          question={question}
          correct={correct}
          revealed={revealed}
          wrongTries={wrongTries}
          onReveal={onReveal}
          onRetry={() => {
            setChecked(false);
            setDraft("");
            inputRef.current?.focus();
          }}
        />
      )}

      <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-5">
        {onBack ? (
          <Button variant="ghost" onClick={onBack} disabled={finishing}>
            Back
          </Button>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2">
          {/* Available in both feedback modes: without it, immediate mode traps
              the user on a question they can't answer, since Check needs input. */}
          {!checked && (
            <Button variant="ghost" onClick={onAdvance} disabled={finishing}>
              Skip
            </Button>
          )}
          <Button
            onClick={primaryAction}
            disabled={!isLast && !checked && !canSubmit}
            loading={finishing}
          >
            {immediate && !checked ? "Check" : isLast ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
