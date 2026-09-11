/**
 * §3.2: a soft per-user daily cap on Mode A, as a code constant. This exists to
 * stop one runaway loop from burning the shared free OpenRouter quota — it is
 * not plan logic, and it never appears as an upgrade prompt.
 */
export const MAX_MODE_A_GENERATIONS_PER_DAY = 20;

/** UTC day key, so the cap doesn't reset twice for users in different zones. */
export function usageDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function quotaExceededMessage(): string {
  return (
    `You've generated ${MAX_MODE_A_GENERATIONS_PER_DAY} quizzes automatically today, which is the ` +
    "daily limit that keeps the free model quota available for everyone. " +
    "You can still build a quiz right now with the copy-paste prompt below."
  );
}

/**
 * §3.3: OCR is one model call per page, so a long scan is the one action here
 * that can spend a large share of the shared free quota in a single click.
 * These bound it in both directions — how much one document may cost, and how
 * much one person may spend in a day.
 *
 * The per-document cap is well under MAX_PAGES: a 150-page handwritten scan is
 * not a study session, it is a mistake, and failing fast is kinder than
 * spending ten minutes discovering it.
 */
export const MAX_OCR_PAGES_PER_DOCUMENT = 60;
export const MAX_OCR_PAGES_PER_DAY = 200;

export function ocrDocumentTooLongMessage(pages: number): string {
  return (
    `This scan is ${pages} pages, and reading handwriting is capped at ` +
    `${MAX_OCR_PAGES_PER_DOCUMENT} pages per document. Split it into smaller files and upload them separately.`
  );
}

export function ocrQuotaExceededMessage(remaining: number): string {
  if (remaining <= 0) {
    return (
      `You've had ${MAX_OCR_PAGES_PER_DAY} pages of handwriting read today, which is the daily ` +
      "limit that keeps the free model quota available for everyone. Try again tomorrow."
    );
  }
  return (
    `Only ${remaining} more page${remaining === 1 ? "" : "s"} of handwriting can be read today, ` +
    "and this document needs more than that. Try again tomorrow, or split the file."
  );
}
