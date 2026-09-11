import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { usageDayKey } from "@/lib/generation/limits";

/**
 * The per-user daily counters behind §3.2's soft caps, in one place.
 *
 * There are two of them now — Mode A generations and OCR pages — and they share
 * a document, so the day rollover has to be understood once rather than by each
 * caller. Writing the whole document per counter is what would quietly reset
 * the other one; `bumpUsage` reads both, resets both when the day has turned,
 * and writes both.
 *
 * These are quota protection for a shared free tier, not plan logic: they never
 * surface as an upgrade prompt.
 */

export interface UsageCounters {
  modeACount: number;
  ocrPages: number;
}

const EMPTY: UsageCounters = { modeACount: 0, ocrPages: 0 };

export async function readUsage(uid: string): Promise<UsageCounters> {
  const snapshot = await adminDb().collection("usage").doc(uid).get();
  const data = snapshot.data();
  // A counter from an earlier day is spent, not carried.
  if (!data || data.day !== usageDayKey()) return { ...EMPTY };
  return {
    modeACount: typeof data.modeACount === "number" ? data.modeACount : 0,
    ocrPages: typeof data.ocrPages === "number" ? data.ocrPages : 0,
  };
}

export async function bumpUsage(
  uid: string,
  field: keyof UsageCounters,
  amount = 1,
): Promise<void> {
  const ref = adminDb().collection("usage").doc(uid);
  const day = usageDayKey();
  await adminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    const current: UsageCounters =
      data && data.day === day
        ? {
            modeACount: typeof data.modeACount === "number" ? data.modeACount : 0,
            ocrPages: typeof data.ocrPages === "number" ? data.ocrPages : 0,
          }
        : { ...EMPTY };

    transaction.set(ref, { day, ...current, [field]: current[field] + amount });
  });
}
