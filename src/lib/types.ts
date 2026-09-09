/**
 * Firestore data model — mirrors reviewhere-spec.md §4.
 * `plan` is intentionally absent: §3.2 makes this single-tier and free.
 */
import type { Timestamp } from "firebase/firestore";

export type ThemePreference = "light" | "dark" | "system";
export type Difficulty = "easy" | "medium" | "hard" | "mixed";
export type QuestionType = "mcq" | "identification";
export type GenerationMode = "auto" | "manualCsv";
export type DocumentStatus = "uploading" | "processing" | "ready" | "failed";
export type FileType = "pdf" | "pptx";
export type FeedbackMode = "immediate" | "end";

export interface UserPreferences {
  theme: ThemePreference;
  /** Percentage of MCQ questions; identification takes the remainder (§2.2). */
  defaultMcqPct: number;
  defaultDifficulty: Difficulty;
  feedbackMode: FeedbackMode;
  timerEnabled: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  defaultMcqPct: 60, // §2.2 default mix is 60/40 MCQ/identification
  defaultDifficulty: "mixed",
  feedbackMode: "end",
  timerEnabled: false,
};

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: Timestamp | null;
  preferences: UserPreferences;
}

export interface StudyDocument {
  id: string;
  ownerId: string;
  fileName: string;
  storagePath: string;
  pageCount: number;
  fileType: FileType;
  status: DocumentStatus;
  sizeBytes: number;
  createdAt: Timestamp | null;
  /** §2.6 subject tags, free-form and client-writable. */
  tags?: string[];
  /** Set when status is "failed" — surfaced with a retry action (§6). */
  errorMessage?: string;
}

export interface Quiz {
  id: string;
  ownerId: string;
  documentId: string;
  title: string;
  questionCount: number;
  /** The mix as actually generated — a chunk can come up short of the request. */
  mix: { mcqPct: number; idPct: number };
  /** What the user asked for, kept so "regenerate" (§2.6) can reuse it. */
  requestedMix?: { mcq: number; identification: number };
  difficulty: Difficulty;
  /** The page range the questions were drawn from; null means the whole document. */
  scope?: { from: number; to: number } | null;
  generationMode: GenerationMode;
  /** Mode A only — which free model answered. Metadata, never branched on. */
  model?: string | null;
  createdAt: Timestamp | null;
  lastAttemptScore: number | null;
  /** §2.6 subject tags, free-form and client-writable. */
  tags?: string[];
}

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  /** MCQ only — exactly 4 choices. */
  choices?: string[];
  correctAnswer: string;
  /** Identification only — alternate acceptable phrasings (§2.2.1). */
  acceptedAnswers?: string[];
  explanation: string;
  sourcePage: number | null;
  difficulty: Difficulty;
}

export interface AttemptAnswer {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  timeSpentSec: number;
}

export interface Attempt {
  id: string;
  quizId: string;
  userId: string;
  startedAt: Timestamp | null;
  completedAt: Timestamp | null;
  score: number;
  /** Wall-clock seconds for the sitting — §2.5 shows this as "time taken". */
  durationSec?: number;
  answers: AttemptAnswer[];
}

/** §2.1: hard limit, enforced server-side — never trust a client page count. */
export const MAX_PAGES = 150;
