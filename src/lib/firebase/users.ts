import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { firestore } from "./client";
import { DEFAULT_PREFERENCES, type UserProfile, type UserPreferences } from "@/lib/types";

const userRef = (uid: string) => doc(firestore(), "users", uid);

/**
 * Called on every sign-in. Creates /users/{uid} on first login and otherwise
 * refreshes the provider-owned fields, leaving preferences untouched.
 */
export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const ref = userRef(user.uid);
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    await setDoc(ref, {
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      createdAt: serverTimestamp(),
      preferences: DEFAULT_PREFERENCES,
    });
  } else {
    await updateDoc(ref, {
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
    });
  }

  const fresh = await getDoc(ref);
  const data = fresh.data() ?? {};
  return {
    uid: user.uid,
    displayName: (data.displayName as string | null) ?? user.displayName,
    email: (data.email as string | null) ?? user.email,
    photoURL: (data.photoURL as string | null) ?? user.photoURL,
    createdAt: data.createdAt ?? null,
    preferences: { ...DEFAULT_PREFERENCES, ...(data.preferences as Partial<UserPreferences>) },
  };
}

export function updatePreferences(uid: string, preferences: Partial<UserPreferences>) {
  const patch = Object.fromEntries(
    Object.entries(preferences).map(([key, value]) => [`preferences.${key}`, value]),
  );
  return updateDoc(userRef(uid), patch);
}

export function updateDisplayName(uid: string, displayName: string) {
  return updateDoc(userRef(uid), { displayName });
}
