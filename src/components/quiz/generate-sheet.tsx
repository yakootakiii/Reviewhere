"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { Toggle } from "@/components/ui/toggle";
import { MixSlider } from "./mix-slider";
import {
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  QUESTION_COUNT_PRESETS,
  defaultSettings,
  normalizeSettings,
} from "@/lib/generation/settings";
import { GenerationError, type QuizSettings } from "@/lib/generation/types";
import type { QuizSource } from "@/lib/quiz-shared";
import type { Difficulty, UserPreferences } from "@/lib/types";

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
  { value: "mixed", label: "Mixed" },
];

/**
 * §7.3: quiz settings live in a sheet, not a page. Mode A and Mode B share this
 * screen because the settings are the same either way — only what happens next
 * differs (§2.2 Mode B step 1).
 */
export function GenerateSheet({
  open,
  onClose,
  document,
  preferences,
  modeAAvailable,
  onGenerate,
  onUsePrompt,
}: {
  open: boolean;
  onClose: () => void;
  document: QuizSource;
  preferences?: UserPreferences;
  modeAAvailable: boolean;
  onGenerate: (settings: QuizSettings) => void;
  onUsePrompt: (settings: QuizSettings) => void;
}) {
  const unit = document.fileType === "pptx" ? "slides" : "pages";
  const [draft, setDraft] = useState<QuizSettings>(() => defaultSettings(preferences));
  const [customCount, setCustomCount] = useState(false);
  const [range, setRange] = useState({ from: "1", to: String(document.pageCount) });
  const [scoped, setScoped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countValue = customCount ? "custom" : String(draft.questionCount);

  function resolve(): QuizSettings | null {
    try {
      const settings = normalizeSettings(
        {
          ...draft,
          scope: scoped ? { from: Number(range.from), to: Number(range.to) } : null,
        },
        document.pageCount,
      );
      setError(null);
      return settings;
    } catch (problem) {
      setError(problem instanceof GenerationError ? problem.userMessage : "Check those settings.");
      return null;
    }
  }

  function submit(handler: (settings: QuizSettings) => void) {
    const settings = resolve();
    if (settings) handler(settings);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Quiz settings"
      description={`From ${document.fileName}`}
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => submit(onUsePrompt)}>
            Use a copy-paste prompt
          </Button>
          {modeAAvailable && (
            <Button onClick={() => submit(onGenerate)} data-autofocus>
              <Sparkles aria-hidden className="size-[18px]" />
              Generate quiz
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-secondary">Questions</span>
          <SegmentedControl
            label="Number of questions"
            value={countValue}
            options={[
              ...QUESTION_COUNT_PRESETS.map((count) => ({
                value: String(count),
                label: String(count),
              })),
              { value: "custom", label: "Custom" },
            ]}
            onChange={(value) => {
              if (value === "custom") {
                setCustomCount(true);
                return;
              }
              setCustomCount(false);
              setDraft((current) => ({ ...current, questionCount: Number(value) }));
            }}
            className="w-full"
          />
          {customCount && (
            <Input
              label="How many questions?"
              type="number"
              min={MIN_QUESTIONS}
              max={MAX_QUESTIONS}
              value={draft.questionCount}
              hint={`Between ${MIN_QUESTIONS} and ${MAX_QUESTIONS}.`}
              onChange={(event) =>
                setDraft((current) => ({ ...current, questionCount: Number(event.target.value) }))
              }
            />
          )}
        </div>

        <MixSlider
          value={draft.mcqPct}
          questionCount={draft.questionCount}
          onChange={(mcqPct) => setDraft((current) => ({ ...current, mcqPct }))}
        />

        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-secondary">Difficulty</span>
          <SegmentedControl
            label="Difficulty"
            value={draft.difficulty}
            options={DIFFICULTIES}
            onChange={(difficulty) => setDraft((current) => ({ ...current, difficulty }))}
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Toggle
            checked={scoped}
            onCheckedChange={setScoped}
            label={`Only part of the document`}
            description={`This one has ${document.pageCount} ${unit}.`}
          />
          {scoped && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={`First ${unit === "slides" ? "slide" : "page"}`}
                type="number"
                min={1}
                max={document.pageCount}
                value={range.from}
                onChange={(event) =>
                  setRange((current) => ({ ...current, from: event.target.value }))
                }
              />
              <Input
                label={`Last ${unit === "slides" ? "slide" : "page"}`}
                type="number"
                min={1}
                max={document.pageCount}
                value={range.to}
                onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}
              />
            </div>
          )}
        </div>

        {!modeAAvailable && (
          <p className="rounded-md bg-surface-secondary p-3 text-caption text-secondary">
            Automatic generation isn&apos;t available right now. The copy-paste prompt works with
            any LLM and produces exactly the same quiz.
          </p>
        )}

        {error && (
          <p role="alert" className="text-caption text-[var(--color-error)]">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
