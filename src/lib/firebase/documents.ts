import {
  collection,
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

/** §2.6 subject tags. Rules allow the owner to rename or tag, never to restate pageCount. */
export function updateDocumentTags(documentId: string, tags: string[]) {
  return updateDoc(doc(firestore(), "documents", documentId), { tags });
}

/**
 * Deleting goes through the API rather than `deleteDoc`: `/documents/{id}/pages`
 * is `write: false` in the rules and Firestore has no cascade, so a client-side
 * delete of the parent would leave every page row orphaned.
 */
export async function deleteDocument(user: User, documentId: string): Promise<void> {
  const token = await user.getIdToken();
  const response = await fetch(`/api/documents/${documentId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "That document couldn't be deleted. Please try again.");
  }
}
