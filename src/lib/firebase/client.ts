import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const config: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * True when .env.local has been filled in. The app renders a setup notice
 * instead of crashing when it hasn't, so the shell stays browsable before a
 * Firebase project exists.
 */
export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

function app() {
  if (!isFirebaseConfigured) {
    throw new Error(
      "Firebase is not configured. Copy .env.local.example to .env.local and fill in your project credentials.",
    );
  }
  return getApps().length ? getApp() : initializeApp(config);
}

export const firebaseAuth = () => getAuth(app());
export const firestore = () => getFirestore(app());
export const firebaseStorage = () => getStorage(app());
