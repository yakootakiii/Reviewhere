import {
  collection,
  doc,
  documentId as documentIdField,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { firestore } from "./client";
import type { CsvValues } from "@/lib/generation/csv-import";
import type { GenerationEvent, QuizSettings } from "@/lib/generation/types";
import type { Question, Quiz } from "@/lib/types";

const quizzes = () => collection(firestore(), "quizzes");

export async function listQuizzes(uid: string, max = 50): Promise<Quiz[]> {
  const snapshot = await getDocs(
    query(quizzes(), where("ownerId", "==", uid), orderBy("createdAt", "desc"), fsLimit(max)),
  );
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as Quiz);
}

/** Both filters are needed: rules only allow a query the owner provably scopes. */
export async function listQuizzesForDocument(uid: string, docId: string): Promise<Quiz[]> {
  const snapshot = await getDocs(
    query(
      quizzes(),
      where("ownerId", "==", uid),
      where("documentId", "==", docId),
      orderBy("createdAt", "desc"),
    ),
  );
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as Quiz);
}

export async function getQuiz(quizId: string): Promise<Quiz | null> {
  const snapshot = await getDoc(doc(firestore(), "quizzes", quizId));
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Quiz) : null;
}

/**
 * Question ids are zero-padded at write time, so ordering by id restores the
 * interleaved order the generator chose (§2.2).
 */
export async function getQuestions(quizId: string): Promise<Question[]> {
  const snapshot = await getDocs(
    query(collection(firestore(), "quizzes", quizId, "questions"), orderBy(documentIdField())),
  );
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as Question);
}

export function renameQuiz(quizId: string, title: string) {
  return updateDoc(doc(firestore(), "quizzes", quizId), { title });
}

export function updateQuizTags(quizId: string, tags: string[]) {
  return updateDoc(doc(firestore(), "quizzes", quizId), { tags });
}

/** Server-side for the same reason as documents: `/questions` is not client-writable. */
export async function deleteQuiz(user: User, quizId: string): Promise<void> {
  const token = await user.getIdToken();
  const response = await fetch(`/api/quizzes/${quizId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "That quiz couldn't be deleted. Please try again.");
  }
}

/** §2.6 duplicate. Returns the new quiz's id. */
export async function duplicateQuiz(user: User, quizId: string): Promise<string> {
  const token = await user.getIdToken();
  const response = await fetch(`/api/quizzes/${quizId}/duplicate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = (await response.json().catch(() => null)) as
    | { quizId?: string; error?: string }
    | null;
  if (!response.ok || !payload?.quizId) {
    throw new Error(payload?.error ?? "That quiz couldn't be duplicated. Please try again.");
  }
  return payload.quizId;
}

/* ------------------------------------------------------- generation (Mode A) */

export interface ModeAAvailability {
  available: boolean;
  model: string;
}

export async function checkModeAAvailability(): Promise<ModeAAvailability> {
  try {
    const response = await fetch("/api/quizzes/generate");
    if (!response.ok) return { available: false, model: "" };
    return (await response.json()) as ModeAAvailability;
  } catch {
    return { available: false, model: "" };
  }
}

export class ModeAError extends Error {
  constructor(
    message: string,
    readonly offerModeB: boolean,
  ) {
    super(message);
    this.name = "ModeAError";
  }
}

/**
 * Runs Mode A, calling `onEvent` as the server reports progress. The route
 * answers with NDJSON so the UI can show what is actually happening instead of
 * a fabricated percentage (§7.7).
 */
export async function generateQuiz(
  user: User,
  documentId: string,
  settings: QuizSettings,
  onEvent: (event: GenerationEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = await user.getIdToken();
  const response = await fetch("/api/quizzes/generate", {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ documentId, settings }),
  });

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      offerModeB?: boolean;
    } | null;
    throw new ModeAError(
      payload?.error ?? "Generation couldn't start. Please try again.",
      payload?.offerModeB ?? false,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Events are newline-delimited; the tail may be a partial line.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as GenerationEvent);
    }
  }

  if (buffer.trim()) onEvent(JSON.parse(buffer) as GenerationEvent);
}

/* ----------------------------------------------------------- import (Mode B) */

export interface ImportResult {
  quizId: string;
  questionCount: number;
  duplicates: number;
}

export class ImportRejected extends Error {
  constructor(
    message: string,
    readonly rowErrors: { rowNumber: number; values: CsvValues; errors: string[] }[],
  ) {
    super(message);
    this.name = "ImportRejected";
  }
}

export async function importQuiz(
  user: User,
  documentId: string,
  settings: QuizSettings,
  rows: CsvValues[],
): Promise<ImportResult> {
  const token = await user.getIdToken();
  const response = await fetch("/api/quizzes/import", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ documentId, settings, rows }),
  });

  const payload = (await response.json().catch(() => null)) as
    | (ImportResult & { error?: string; rowErrors?: ImportRejected["rowErrors"] })
    | null;

  if (!response.ok) {
    const message = payload?.error ?? "That import couldn't be saved. Please try again.";
    // The server re-validates every row, so it can still reject what the
    // preview accepted — surface those rows rather than a generic failure.
    if (payload?.rowErrors) throw new ImportRejected(message, payload.rowErrors);
    throw new Error(message);
  }

  return payload as ImportResult;
}
