/**
 * A small RFC 4180 parser for the Mode B import contract (§2.2.1).
 *
 * Hand-written rather than a dependency: the contract is a fixed 10-column
 * header, the rules that matter are quoting, doubled quotes and embedded
 * newlines, and keeping it here means the importer can be tested against real
 * CSV text with no mocking layer in between.
 */

export interface CsvRow {
  /** Position in the file, counting the header as row 1. */
  rowNumber: number;
  values: string[];
}

export function parseCsv(input: string): CsvRow[] {
  // Excel and friends prepend a BOM; it would otherwise poison the first header.
  const text = input.replace(/^﻿/, "");

  const rows: CsvRow[] = [];
  let values: string[] = [];
  let value = "";
  let quoted = false;
  let started = false;

  const endValue = () => {
    values.push(value);
    value = "";
  };

  const endRow = () => {
    endValue();
    // A trailing newline shouldn't invent an empty final row.
    if (!(values.length === 1 && values[0] === "")) {
      rows.push({ rowNumber: rows.length + 1, values });
    }
    values = [];
    started = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"' && !started) {
      quoted = true;
      started = true;
      continue;
    }
    if (char === ",") {
      endValue();
      started = false;
      continue;
    }
    if (char === "\r") {
      // Swallow CRLF as one break; a lone CR is treated the same way.
      if (text[index + 1] === "\n") index += 1;
      endRow();
      continue;
    }
    if (char === "\n") {
      endRow();
      continue;
    }

    value += char;
    started = true;
  }

  // Whatever is left when the input ends is the last row, unless it is empty.
  if (value !== "" || values.length > 0) endRow();

  return rows;
}
