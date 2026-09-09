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
