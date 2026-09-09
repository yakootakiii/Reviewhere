import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses a plain row", () => {
    expect(parseCsv("a,b,c").map((row) => row.values)).toEqual([["a", "b", "c"]]);
  });

  it("keeps commas inside quoted fields", () => {
    const rows = parseCsv('type,question\nmcq,"Which of these, exactly, is true?"');
    expect(rows[1].values).toEqual(["mcq", "Which of these, exactly, is true?"]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('a,"She said ""hi"" once"')[0].values).toEqual(["a", 'She said "hi" once']);
  });

  it("keeps newlines inside quoted fields as one row", () => {
    const rows = parseCsv('a,"line one\nline two"\nb,c');
    expect(rows).toHaveLength(2);
    expect(rows[0].values).toEqual(["a", "line one\nline two"]);
    expect(rows[1].values).toEqual(["b", "c"]);
  });

  it("treats CRLF as a single row break", () => {
    expect(parseCsv("a,b\r\nc,d").map((row) => row.values)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("preserves empty fields and ignores a trailing newline", () => {
    const rows = parseCsv("a,,c\n");
    expect(rows).toHaveLength(1);
    expect(rows[0].values).toEqual(["a", "", "c"]);
  });

  it("strips a leading byte-order mark so the header still matches", () => {
    expect(parseCsv("﻿type,question")[0].values[0]).toBe("type");
  });

  it("numbers rows from 1, counting the header", () => {
    const rows = parseCsv("header\nfirst\nsecond");
    expect(rows.map((row) => row.rowNumber)).toEqual([1, 2, 3]);
  });
});
