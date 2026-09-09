/** Limits shared by the upload UI and the ingest route. */

/**
 * A hard ceiling on upload size, separate from the 150-page rule (§2.1).
 * Note for deployment: Vercel's serverless functions cap request bodies at
 * 4.5 MB, so a larger limit here needs either a host without that cap or a
 * move to client-side extraction.
 */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Firestore documents cap at 1 MiB; pages are batched well under that. */
export const MAX_CHARS_PER_PAGE_DOC = 200_000;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
