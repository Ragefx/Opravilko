import type { FirebaseOptions } from "firebase/app";

/**
 * The Firebase project's web config. These values identify the project and
 * are safe to publish (access is controlled by the security rules in
 * /firestore.rules and by sign-in), so they live in the code.
 *
 * VITE_FIREBASE_CONFIG (a JSON string) overrides them, and
 * VITE_FIREBASE_EMULATOR=1 points the app at local emulators for testing.
 */
const PROJECT_CONFIG: FirebaseOptions | null = null;

function fromEnv(): FirebaseOptions | null {
  const raw = import.meta.env.VITE_FIREBASE_CONFIG;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FirebaseOptions;
  } catch {
    console.warn("VITE_FIREBASE_CONFIG is not valid JSON");
    return null;
  }
}

export const useEmulator = import.meta.env.VITE_FIREBASE_EMULATOR === "1";

export const firebaseConfig: FirebaseOptions | null =
  fromEnv() ??
  PROJECT_CONFIG ??
  (useEmulator ? { apiKey: "demo-key", authDomain: "localhost", projectId: "demo-opravilko", appId: "demo" } : null);

/** False until a Firebase project is configured; the app then offers only Dropbox. */
export const firebaseEnabled = firebaseConfig !== null;
