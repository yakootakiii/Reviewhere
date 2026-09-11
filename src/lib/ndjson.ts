/**
 * Reads a newline-delimited JSON response, one event at a time.
 *
 * Both long-running routes stream progress this way — generation and OCR — and
 * the fiddly part is the same in both: a chunk boundary can land mid-line, so
 * the tail has to be held back until the next read completes it, and whatever
 * remains after the stream ends is a final event rather than a leftover.
 * Getting that subtly wrong drops the "done" event, so it lives in one place.
 */
export async function readNdjson<T>(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: T) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    // The last element is either empty or a partial line; keep it for next time.
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as T);
    }
  }

  if (buffer.trim()) onEvent(JSON.parse(buffer) as T);
}
