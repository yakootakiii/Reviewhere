"use client";

import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CSV_HEADER, describeImport, type ImportRow } from "@/lib/generation/csv-import";
import { cn } from "@/lib/utils";

/** Friendlier labels than the raw column names for the inline fix form. */
const COLUMN_LABELS: Record<string, string> = {
  type: "Type",
  question: "Question",
  choice_a: "Choice A",
  choice_b: "Choice B",
  choice_c: "Choice C",
  choice_d: "Choice D",
  correct_answer: "Correct answer",
  accepted_answers: "Accepted answers (a|b|c)",
  explanation: "Explanation",
  source_page: "Source page",
};

const CHOICE_COLUMNS = ["choice_a", "choice_b", "choice_c", "choice_d"];

/**
 * §2.2.1: bad rows are surfaced, never dropped. Each one can be fixed in place
 * or deliberately skipped, and the whole file can be replaced with a corrected
 * one — the two repair routes the spec left open in §10.
 */
export function CsvPreview({
  rows,
  skipped,
  onEditRow,
  onToggleSkip,
  onReplace,
  onConfirm,
  saving,
}: {
  rows: ImportRow[];
  skipped: Set<number>;
  onEditRow: (rowNumber: number, column: string, value: string) => void;
  onToggleSkip: (rowNumber: number) => void;
  onReplace: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  const active = rows.filter((row) => !skipped.has(row.rowNumber));
  const broken = active.filter((row) => row.errors.length > 0);
  const good = active.filter((row) => row.errors.length === 0);

  const mcqCount = good.filter((row) => row.values.type?.trim().toLowerCase() === "mcq").length;
  const summary = describeImport({
    mcqCount,
    identificationCount: good.length - mcqCount,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-lg bg-surface hairline p-4">
        <div
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-[10px]",
            broken.length === 0
              ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
              : "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
          )}
        >
          {broken.length === 0 ? (
            <CheckCircle2 className="size-5" />
          ) : (
            <AlertTriangle className="size-5" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-callout font-medium">{summary}</p>
          {broken.length > 0 && (
            <p className="text-caption text-secondary">
              {broken.length} row{broken.length === 1 ? "" : "s"} need
              {broken.length === 1 ? "s" : ""} a fix before you can save.
            </p>
          )}
          {skipped.size > 0 && (
            <p className="text-caption text-tertiary">
              {skipped.size} row{skipped.size === 1 ? "" : "s"} skipped.
            </p>
          )}
        </div>
      </div>

      {broken.length > 0 && (
        <ul className="flex flex-col gap-3">
          {broken.map((row) => (
            <BrokenRow
              key={row.rowNumber}
              row={row}
              onEdit={onEditRow}
              onSkip={() => onToggleSkip(row.rowNumber)}
            />
          ))}
        </ul>
      )}

      {skipped.size > 0 && (
        <ul className="flex flex-col gap-1">
          {rows
            .filter((row) => skipped.has(row.rowNumber))
            .map((row) => (
              <li
                key={row.rowNumber}
                className="flex items-center justify-between gap-3 rounded-md bg-surface-secondary px-3 py-2"
              >
                <span className="truncate text-caption text-secondary">
                  Row {row.rowNumber} skipped — {row.values.question || "(no question text)"}
                </span>
                <Button variant="ghost" size="sm" onClick={() => onToggleSkip(row.rowNumber)}>
                  Put it back
                </Button>
              </li>
            ))}
        </ul>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onReplace} disabled={saving}>
          <RotateCcw aria-hidden className="size-[18px]" />
          Replace CSV
        </Button>
        <Button onClick={onConfirm} loading={saving} disabled={good.length === 0 || broken.length > 0}>
          Save {good.length} question{good.length === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}

function BrokenRow({
  row,
  onEdit,
  onSkip,
}: {
  row: ImportRow;
  onEdit: (rowNumber: number, column: string, value: string) => void;
  onSkip: () => void;
}) {
  const isIdentification = row.values.type?.trim().toLowerCase() === "identification";
  const columns = CSV_HEADER.filter(
    (column) => !(isIdentification && CHOICE_COLUMNS.includes(column)),
  );

  return (
    <li className="flex flex-col gap-3 border-l-2 border-[var(--color-error)] py-2 pl-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-callout font-medium">Row {row.rowNumber}</p>
          <ul className="flex flex-col gap-0.5">
            {row.errors.map((error) => (
              <li key={error} className="text-caption text-secondary">
                {error}
              </li>
            ))}
          </ul>
        </div>
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Skip row
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {columns.map((column) => (
          <label key={column} className="flex flex-col gap-1">
            <span className="text-caption text-secondary">{COLUMN_LABELS[column]}</span>
            <input
              value={row.values[column] ?? ""}
              onChange={(event) => onEdit(row.rowNumber, column, event.target.value)}
              className={cn(
                "h-10 w-full rounded-[10px] bg-surface px-3 text-caption text-primary",
                "border border-[var(--color-border-strong)] outline-none",
                "focus-visible:border-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]",
              )}
            />
          </label>
        ))}
      </div>
    </li>
  );
}
