"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardCopy, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorPanel, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/auth-provider";
import { CsvPreview } from "./csv-preview";
import { getDocumentPages } from "@/lib/firebase/documents";
import { ImportRejected, importQuiz } from "@/lib/firebase/quizzes";
import { importCsv, validateCsvRow, type ImportRow } from "@/lib/generation/csv-import";
import { buildModeBPrompt } from "@/lib/generation/prompt";
import { GenerationError, type QuizSettings } from "@/lib/generation/types";
import type { ExtractedPage } from "@/lib/extraction/types";
import type { QuizSource } from "@/lib/quiz-shared";

type Stage =
  | { name: "loading" }
  | { name: "unreadable"; message: string }
  | { name: "ready" };

/**
 * Mode B (§2.2): the prompt already carries the user's settings and the
 * document text, so the round trip is copy → any LLM → paste the CSV back.
 * A permanent path, not a fallback for when Mode A is down.
 */
export function ModeBPanel({
  document,
  settings,
  onImported,
  onBack,
}: {
  document: QuizSource;
  settings: QuizSettings;
  onImported: (result: { quizId: string; questionCount: number }) => void;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>({ name: "loading" });
  const [pages, setPages] = useState<ExtractedPage[]>([]);
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    getDocumentPages(document.id)
      .then((loaded) => {
        if (!active) return;
        setPages(loaded);
        setStage({ name: "ready" });
      })
      .catch(() => {
        if (!active) return;
        setStage({
          name: "unreadable",
          message: "We couldn't load this document's text. Try again in a moment.",
        });
      });
    return () => {
      active = false;
    };
  }, [document.id]);

  const built = useMemo(
    () =>
      pages.length > 0
        ? buildModeBPrompt(pages, settings, {
            fileName: document.fileName,
            pageCount: document.pageCount,
          })
        : null,
    [pages, settings, document.fileName, document.pageCount],
  );

  const context = useMemo(
    () => ({ pageCount: document.pageCount, fallbackDifficulty: settings.difficulty }),
    [document.pageCount, settings.difficulty],
  );

  const parse = useCallback(
    (text: string) => {
      setCsv(text);
      try {
        const result = importCsv(text, context);
        setRows(result.rows);
        setSkipped(new Set());
        setParseError(null);
      } catch (error) {
        setRows(null);
        setParseError(
          error instanceof GenerationError ? error.userMessage : "That CSV couldn't be read.",
        );
      }
    },
    [context],
  );

  async function copyPrompt() {
    if (!built) return;
    try {
      await navigator.clipboard.writeText(built.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast("Your browser blocked the copy — select the prompt and copy it manually.", "error");
    }
  }

  async function onFile(file: File) {
    parse(await file.text());
  }

  /** Re-validating on edit is what lets a fixed row clear itself in place. */
  function editRow(rowNumber: number, column: string, value: string) {
    setRows((current) =>
      (current ?? []).map((row) => {
        if (row.rowNumber !== rowNumber) return row;
        const values = { ...row.values, [column]: value };
        const result = validateCsvRow(values, context);
        return { ...row, values, errors: result.ok ? [] : result.errors };
      }),
    );
  }

  function toggleSkip(rowNumber: number) {
    setSkipped((current) => {
      const next = new Set(current);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  async function save() {
    if (!user || !rows) return;
    setSaving(true);
    try {
      const payload = rows
        .filter((row) => !skipped.has(row.rowNumber))
        .map((row) => row.values);
      const result = await importQuiz(user, document.id, settings, payload);
      toast(`Quiz saved — ${result.questionCount} questions.`, "success");
      onImported(result);
    } catch (error) {
      if (error instanceof ImportRejected) {
        // The server re-checked and disagreed; fold its verdict back into the preview.
        const byRow = new Map(error.rowErrors.map((row) => [row.rowNumber, row.errors]));
        setRows((current) =>
          (current ?? []).map((row) => ({ ...row, errors: byRow.get(row.rowNumber) ?? row.errors })),
        );
      }
      toast(error instanceof Error ? error.message : "That import couldn't be saved.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (stage.name === "loading") {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (stage.name === "unreadable") {
    return (
      <ErrorPanel
        title="We couldn't build the prompt"
        description={stage.message}
        action={<Button onClick={onBack}>Back to settings</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-title2">1. Copy this prompt</h2>
            <p className="text-callout text-secondary">
              Paste it into ChatGPT, Claude, Gemini — any LLM. Your settings and the document text
              are already in it.
            </p>
          </div>
          <Button onClick={copyPrompt}>
            {copied ? (
              <Check aria-hidden className="size-[18px]" />
            ) : (
              <ClipboardCopy aria-hidden className="size-[18px]" />
            )}
            {copied ? "Copied" : "Copy prompt"}
          </Button>
        </div>

        {built?.truncated && (
          <p className="rounded-md bg-[var(--color-warning-soft)] p-3 text-caption text-secondary">
            This document is long, so the prompt stops at page {built.includedTo}. For questions
            from later pages, set a page range in the quiz settings and copy the prompt again.
          </p>
        )}

        <pre className="max-h-72 overflow-auto rounded-xl bg-surface-secondary p-4 text-caption whitespace-pre-wrap">
          {built?.prompt}
        </pre>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-title2">2. Paste the CSV back</h2>
          <p className="text-callout text-secondary">
            Paste what the LLM returned, or upload the .csv file it produced.
          </p>
        </div>

        <textarea
          value={csv}
          onChange={(event) => parse(event.target.value)}
          rows={6}
          spellCheck={false}
          aria-label="CSV returned by your LLM"
          placeholder="type,question,choice_a,choice_b,choice_c,choice_d,correct_answer,accepted_answers,explanation,source_page"
          className="w-full rounded-md border border-[var(--color-border-strong)] bg-surface p-3.5 font-mono text-caption text-primary outline-none placeholder:text-tertiary focus-visible:border-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
        />

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onFile(file);
              event.target.value = "";
            }}
          />
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload aria-hidden className="size-[18px]" />
            Upload a .csv
          </Button>
          <Button variant="ghost" size="sm" onClick={onBack}>
            Back to settings
          </Button>
        </div>

        {parseError && (
          <p role="alert" className="rounded-md bg-[var(--color-error-soft)] p-3 text-caption whitespace-pre-wrap">
            {parseError}
          </p>
        )}
      </section>

      {rows && rows.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-title2">3. Check and save</h2>
          <CsvPreview
            rows={rows}
            skipped={skipped}
            onEditRow={editRow}
            onToggleSkip={toggleSkip}
            onReplace={() => {
              setCsv("");
              setRows(null);
              setSkipped(new Set());
              setParseError(null);
            }}
            onConfirm={save}
            saving={saving}
          />
        </section>
      )}
    </div>
  );
}
