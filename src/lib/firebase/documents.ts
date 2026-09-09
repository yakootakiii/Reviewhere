import {
  collection,
  deleteDoc,
  doc,
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
import type { ExtractedPage } from "@/lib/extraction/types";
import type { StudyDocument } from "@/lib/types";

export interface IngestResult {
  documentId: string;
  fileName: string;
  pageCount: number;
  fileType: "pdf" | "pptx";
  emptyPages: number[];
}

/**
 * Uploads to the ingest route, which extracts and validates server-side.
 * XMLHttpRequest rather than fetch because it reports upload progress (§2.1).
 */
export function uploadDocument(
  user: User,
  file: File,
  onProgress: (fraction: number) => void,
): { promise: Promise<IngestResult>; abort: () => void } {
  const request = new XMLHttpRequest();

  const promise = (async () => {
    const token = await user.getIdToken();
    const body = new FormData();
    body.append("file", file);

    return new Promise<IngestResult>((resolve, reject) => {
      request.open("POST", "/api/documents");
      request.setRequestHeader("Authorization", `Bearer ${token}`);

      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      });

      request.addEventListener("load", () => {
        let payload: unknown;
        try {
          payload = JSON.parse(request.responseText);
        } catch {
          reject(new Error("The server sent back something unexpected. Please try again."));
          return;
        }
        if (request.status >= 200 && request.status < 300) {
          resolve(payload as IngestResult);
        } else {
          const message = (payload as { error?: string })?.error;
          reject(new Error(message ?? "Upload failed. Please try again."));
        }
      });

      request.addEventListener("error", () =>
        reject(new Error("Network error. Check your connection and try again.")),
      );
      request.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));

      request.send(body);
    });
  })();

  return { promise, abort: () => request.abort() };
}

export async function listDocuments(uid: string, max = 50): Promise<StudyDocument[]> {
  const snapshot = await getDocs(
    query(
      collection(firestore(), "documents"),
      where("ownerId", "==", uid),
      orderBy("createdAt", "desc"),
      fsLimit(max),
    ),
  );
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as StudyDocument);
}

export async function getDocument(documentId: string): Promise<StudyDocument | null> {
  const snapshot = await getDoc(doc(firestore(), "documents", documentId));
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as StudyDocument) : null;
}

/** Extracted text for a document, ordered by page (§2.3 sourcePage). */
export async function getDocumentPages(documentId: string): Promise<ExtractedPage[]> {
  const snapshot = await getDocs(
    query(collection(firestore(), "documents", documentId, "pages"), orderBy("page")),
  );
  return snapshot.docs.map((entry) => entry.data() as ExtractedPage);
}

export function renameDocument(documentId: string, fileName: string) {
  return updateDoc(doc(firestore(), "documents", documentId), { fileName });
}

export function deleteDocument(documentId: string) {
  // Page subdocuments are cleaned up server-side; this removes it from the library.
  return deleteDoc(doc(firestore(), "documents", documentId));
}
