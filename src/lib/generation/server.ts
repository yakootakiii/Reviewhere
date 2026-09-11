/**
 * Server-side plumbing shared by both generation routes. Both modes persist
 * through `writeQuiz` so the two paths cannot drift apart in what they store.
 */
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { bumpUsage, readUsage } from "@/lib/usage";
import type { ExtractedPage } from "@/lib/extraction/types";
import type { GenerationMode, StudyDocument } from "@/lib/types";
import { MAX_MODE_A_GENERATIONS_PER_DAY, quotaExceededMessage } from "./limits";
import { resolveCounts } from "./settings";
import { questionDocId } from "./questions";
import { GenerationError, type QuestionDraft, type QuizSettings } from "./types";

export type OwnedDocument = Pick<
  StudyDocument,
  "id" | "ownerId" | "fileName" | "pageCount" | "fileType"
>;

/**
 * Ownership is checked here rather than trusted from the client. The Firestore
 * rules already scope reads to the owner, but these routes use the Admin SDK,
 * which bypasses rules by design — so the check has to be explicit.
 */
export async function loadOwnedDocument(uid: string, documentId: string): Promise<OwnedDocument> {
  if (!documentId) throw new GenerationError("No document was chosen.");

  const snapshot = await adminDb().collection("documents").doc(documentId).get();
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.ownerId !== uid) {
    throw new GenerationError("We couldn't find that document in your library.");
  }

  return {
    id: snapshot.id,
    ownerId: data.ownerId as string,
    fileName: data.fileName as string,
    pageCount: data.pageCount as number,
    fileType: data.fileType as StudyDocument["fileType"],
  };
}

export async function loadPages(documentId: string): Promise<ExtractedPage[]> {
  const snapshot = await adminDb()
    .collection("documents")
    .doc(documentId)
    .collection("pages")
    .get();

  return snapshot.docs
    .map((entry) => entry.data() as ExtractedPage)
    .sort((a, b) => a.page - b.page);
}

/**
 * The daily Mode A counter lives in a server-owned collection, not on
 * /users/{uid}, which the client can write — a user could otherwise reset their
 * own counter.
 */
export async function assertModeAQuota(uid: string): Promise<void> {
  const { modeACount } = await readUsage(uid);
  if (modeACount >= MAX_MODE_A_GENERATIONS_PER_DAY) {
    throw new GenerationError(quotaExceededMessage(), { offerModeB: true });
  }
}

export async function recordModeAGeneration(uid: string): Promise<void> {
  await bumpUsage(uid, "modeACount");
}


export interface WriteQuizInput {
  uid: string;
  document: OwnedDocument;
  settings: QuizSettings;
  questions: QuestionDraft[];
  generationMode: GenerationMode;
  title: string;
  /** Mode A only — which model in the chain actually answered. */
  model?: string | null;
}

/**
 * Writes the quiz and its questions. `generationMode` is recorded as metadata
 * and read by nothing downstream: the schema is identical either way (§2.2).
 */
export async function writeQuiz(input: WriteQuizInput): Promise<string> {
  const db = adminDb();
  const quizRef = db.collection("quizzes").doc();
  const actual = resolveActualMix(input.questions);

  await quizRef.set({
    ownerId: input.uid,
    documentId: input.document.id,
    title: input.title,
    questionCount: input.questions.length,
    // The mix as generated, not as requested — a chunk can come up short.
    mix: actual,
    requestedMix: resolveCounts(input.settings.questionCount, input.settings.mcqPct),
    difficulty: input.settings.difficulty,
    scope: input.settings.scope,
    generationMode: input.generationMode,
    model: input.model ?? null,
    lastAttemptScore: null,
    createdAt: FieldValue.serverTimestamp(),
  });

  // Ids are zero-padded so their natural ordering is the interleaved order.
  const batch = db.batch();
  input.questions.forEach((question, index) => {
    batch.set(quizRef.collection("questions").doc(questionDocId(index)), question);
  });
  await batch.commit();

  return quizRef.id;
}

function resolveActualMix(questions: QuestionDraft[]) {
  const total = questions.length || 1;
  const mcq = questions.filter((question) => question.type === "mcq").length;
  return {
    mcqPct: Math.round((mcq / total) * 100),
    idPct: 100 - Math.round((mcq / total) * 100),
  };
}

/**
 * Removes a document and its extracted page text. Quizzes generated from it are
 * deliberately kept: their questions were copied into the quiz at generation
 * time, so they stay playable without the source (only the page links go dead).
 */
export async function deleteDocumentDeep(uid: string, documentId: string): Promise<void> {
  const document = await loadOwnedDocument(uid, documentId);
  const db = adminDb();
  // recursiveDelete takes the /pages subcollection with it; a plain delete on
  // the parent would leave every page row orphaned forever.
  await db.recursiveDelete(db.collection("documents").doc(document.id));
}

/** Removes a quiz, its questions, and the attempts that only made sense with it. */
export async function deleteQuizDeep(uid: string, quizId: string): Promise<void> {
  const db = adminDb();
  const snapshot = await db.collection("quizzes").doc(quizId).get();
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.ownerId !== uid) {
    throw new GenerationError("We couldn't find that quiz in your library.");
  }

  const attempts = await db
    .collection("attempts")
    .where("userId", "==", uid)
    .where("quizId", "==", quizId)
    .get();

  const batch = db.batch();
  for (const attempt of attempts.docs) batch.delete(attempt.ref);
  await batch.commit();

  await db.recursiveDelete(db.collection("quizzes").doc(quizId));
}

/**
 * §2.6 duplicate. Goes through the same question-writing path as `writeQuiz` so
 * the copy is stored exactly as a freshly generated quiz would be.
 */
export async function duplicateQuiz(uid: string, quizId: string): Promise<string> {
  const db = adminDb();
  const source = await db.collection("quizzes").doc(quizId).get();
  const data = source.data();
  if (!source.exists || !data || data.ownerId !== uid) {
    throw new GenerationError("We couldn't find that quiz in your library.");
  }

  const questions = await db
    .collection("quizzes")
    .doc(quizId)
    .collection("questions")
    .get();

  const copyRef = db.collection("quizzes").doc();
  await copyRef.set({
    ...data,
    title: `${data.title as string} (copy)`,
    // A copy starts with no history of its own.
    lastAttemptScore: null,
    createdAt: FieldValue.serverTimestamp(),
  });

  const batch = db.batch();
  // Ids are already zero-padded in the source, and copying them verbatim keeps
  // the interleaved order the generator chose.
  for (const question of questions.docs) {
    batch.set(copyRef.collection("questions").doc(question.id), question.data());
  }
  await batch.commit();

  return copyRef.id;
}
