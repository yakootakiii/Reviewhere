/**
 * Mode B import (§2.2.1). Validates row by row and reports every bad row for
 * the preview — nothing is ever silently dropped.
 */
import { parseCsv } from "./csv";
import { validateQuestionRow } from "./questions";
import { GenerationError, type QuestionDraft, type RowError, type ValidationContext } from "./types";

/** The exact contract handed to the user's LLM (§2.2.1). */
export const CSV_HEADER = [
  "type",
  "question",
  "choice_a",
  "choice_b",
  "choice_c",
  "choice_d",
  "correct_answer",
  "accepted_answers",
  "explanation",
  "source_page",
] as const;

export type CsvColumn = (typeof CSV_HEADER)[number];
export type CsvValues = Record<string, string>;

/** One data row as parsed, with whatever is wrong with it. Empty errors = valid. */
export interface ImportRow {
  rowNumber: number;
  values: CsvValues;
  errors: string[];
}

export interface CsvImportResult {
  /** Every data row, in file order — this is what the preview edits. */
  rows: ImportRow[];
  questions: QuestionDraft[];
  rowErrors: RowError[];
  /** Data rows seen, good and bad. */
  totalRows: number;
  mcqCount: number;
  identificationCount: number;
}

/**
 * Validates one record. Exported so the preview can re-check a single row after
 * an inline edit without re-parsing the whole file.
 */
export function validateCsvRow(values: CsvValues, context: ValidationContext) {
  return validateQuestionRow(values, context);
}

export function importCsv(text: string, context: ValidationContext): CsvImportResult {
  const rows = text.trim() === "" ? [] : parseCsv(text);
  if (rows.length === 0) {
    throw new GenerationError("That CSV is empty — paste the rows your LLM returned.");
  }

  const header = rows[0].values.map((column) => column.trim().toLowerCase());
  const missing = CSV_HEADER.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new GenerationError(
      `That doesn't look like the expected CSV. The first line has to be the header row:\n${CSV_HEADER.join(",")}`,
    );
  }

  const parsed: ImportRow[] = [];
  const questions: QuestionDraft[] = [];
  const rowErrors: RowError[] = [];
  let mcqCount = 0;
  let identificationCount = 0;

  for (const row of rows.slice(1)) {
    // A row of nothing but commas is padding from a spreadsheet export, not data.
    if (row.values.every((value) => value.trim() === "")) continue;

    const values = toValues(header, row.values);
    const result = validateCsvRow(values, context);

    parsed.push({ rowNumber: row.rowNumber, values, errors: result.ok ? [] : result.errors });

    if (result.ok) {
      questions.push(result.question);
      if (result.question.type === "mcq") mcqCount += 1;
      else identificationCount += 1;
    } else {
      rowErrors.push({ rowNumber: row.rowNumber, values, errors: result.errors });
    }
  }

  return {
    rows: parsed,
    questions,
    rowErrors,
    totalRows: parsed.length,
    mcqCount,
    identificationCount,
  };
}

function toValues(header: string[], values: string[]): CsvValues {
  const record: CsvValues = {};
  header.forEach((column, index) => {
    record[column] = values[index] ?? "";
  });
  return record;
}

/** "18 questions detected — 11 multiple choice, 7 identification" (§2.2). */
export function describeImport(result: Pick<CsvImportResult, "mcqCount" | "identificationCount">) {
  const total = result.mcqCount + result.identificationCount;
  return `${total} question${total === 1 ? "" : "s"} detected — ${result.mcqCount} multiple choice, ${result.identificationCount} identification`;
}
