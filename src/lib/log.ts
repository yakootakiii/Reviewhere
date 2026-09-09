import "server-only";

/**
 * One shape for server-side error logs (§8 M6 monitoring).
 *
 * Deliberately not a third-party service: at ~5 private users (§3.2) the value
 * is in being able to read the host's logs and know which route failed and for
 * whom, not in an analytics pipeline. Carries the route and the caller's uid
 * and nothing else — no answer text, no document content, no email.
 */
export function logRouteError(
  scope: string,
  error: unknown,
  context: { uid?: string | null; [key: string]: unknown } = {},
): void {
  const detail = error instanceof Error ? { name: error.name, message: error.message } : { error };
  console.error(
    JSON.stringify({
      at: new Date().toISOString(),
      scope,
      ...context,
      ...detail,
    }),
    // The stack goes out separately so the JSON line stays greppable.
    error instanceof Error && error.stack ? `\n${error.stack}` : "",
  );
}
