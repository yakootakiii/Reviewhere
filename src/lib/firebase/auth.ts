import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  OAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User,
  type UserCredential,
} from "firebase/auth";
import { firebaseAuth } from "./client";

/**
 * Firebase error codes are not user-facing copy. §7.4 asks for plain-language
 * error states, so every path funnels through here.
 */
export function friendlyAuthError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  switch (code) {
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/missing-password":
      return "Enter your password to continue.";
    case "auth/weak-password":
      return "Passwords need to be at least 6 characters.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try signing in instead.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password don't match an account.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in window. Allow pop-ups and try again.";
    case "auth/account-exists-with-different-credential":
      return "This email is already linked to a different sign-in method. Use that one instead.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/operation-not-allowed":
      return "This sign-in method isn't enabled for this project yet.";
    default:
      return "Something went wrong signing you in. Please try again.";
  }
}

export function signInWithGoogle(): Promise<UserCredential> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(firebaseAuth(), provider);
}

export function signInWithApple(): Promise<UserCredential> {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  return signInWithPopup(firebaseAuth(), provider);
}

export function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
}

/** §2.7: email/password accounts get a verification email on creation. */
export async function signUpWithEmail(
  displayName: string,
  email: string,
  password: string,
): Promise<UserCredential> {
  const credential = await createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password);
  const name = displayName.trim();
  if (name) await updateProfile(credential.user, { displayName: name });
  await sendEmailVerification(credential.user).catch(() => {
    /* Non-fatal: the user can resend from Settings. */
  });
  return credential;
}

export function resendVerification(user: User) {
  return sendEmailVerification(user);
}

export function requestPasswordReset(email: string) {
  return sendPasswordResetEmail(firebaseAuth(), email.trim());
}

export function signOut() {
  return fbSignOut(firebaseAuth());
}

/**
 * §2.7 destructive action. Firebase requires a recent login before deletion,
 * so callers must surface `requiresRecentLogin` as "sign in again", not as a
 * generic failure.
 */
export async function deleteAccount(user: User): Promise<{ requiresRecentLogin: boolean }> {
  try {
    await user.delete();
    return { requiresRecentLogin: false };
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (code === "auth/requires-recent-login") return { requiresRecentLogin: true };
    throw error;
  }
}

/** Human-readable names for the providers linked to an account (§2.7). */
export function providerLabel(providerId: string): string {
  switch (providerId) {
    case "google.com":
      return "Google";
    case "apple.com":
      return "Apple";
    case "password":
      return "Email and password";
    default:
      return providerId;
  }
}
