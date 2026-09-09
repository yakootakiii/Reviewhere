import "server-only";

import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Server-side Firebase. The deployed rules make /documents and /quizzes
 * server-write-only (§2.2), so every write on the ingest and generation paths
 * goes through the Admin SDK, which bypasses rules by design.
 *
 * FIREBASE_SERVICE_ACCOUNT holds the service-account JSON — either raw or
 * base64-encoded, since dashboards mangle multi-line values differently.
 */
function credentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;

  const json = raw.trim().startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");

  try {
    const parsed = JSON.parse(json) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      // Escaped newlines survive round-tripping through env vars; real ones don't.
      privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

export const isAdminConfigured = credentials() !== null;

let cached: App | null = null;

function adminApp(): App {
  if (cached) return cached;
  if (getApps().length) {
    cached = getApp();
    return cached;
  }

  const creds = credentials();
  if (!creds) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is not set. Generate a key in Firebase console → " +
        "Project settings → Service accounts → Generate new private key, then add it to .env.local.",
    );
  }

  cached = initializeApp({ credential: cert(creds), projectId: creds.projectId });
  return cached;
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());

/**
 * Resolves the caller's uid from a bearer ID token. Returns null rather than
 * throwing so route handlers can answer 401 uniformly.
 */
export async function uidFromAuthHeader(header: string | null): Promise<string | null> {
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return null;
  try {
    return (await adminAuth().verifyIdToken(token)).uid;
  } catch {
    return null;
  }
}
