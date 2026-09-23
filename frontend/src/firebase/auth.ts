import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { firebaseAuth } from "./app";
import { firebaseEnabled, useEmulator } from "./config";

let ready = false;

/**
 * Waits until Firebase has restored any saved sign-in, so `currentUser()` is
 * reliable. Called once before the app first renders.
 */
export async function initFirebaseAuth(): Promise<void> {
  if (!firebaseEnabled) {
    ready = true;
    return;
  }
  const auth = firebaseAuth();
  await auth.authStateReady();
  ready = true;
  if (useEmulator) {
    // Tests sign in without Google's popup: the Auth emulator accepts unsigned tokens.
    (window as any).__opravilkoTestSignIn = (email: string, name = email.split("@")[0]) =>
      signInWithCredential(
        auth,
        GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, name, email_verified: true }))
      );
  }
}

export function currentUser(): User | null {
  if (!firebaseEnabled || !ready) return null;
  return firebaseAuth().currentUser;
}

export function onUserChanged(listener: (user: User | null) => void): () => void {
  if (!firebaseEnabled) return () => {};
  return onAuthStateChanged(firebaseAuth(), listener);
}

export async function signInWithGoogle(): Promise<void> {
  const auth = firebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (err: any) {
    // Popups blocked (some mobile browsers): fall back to a full-page redirect.
    if (err?.code === "auth/popup-blocked" || err?.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}

export async function signOut(): Promise<void> {
  await fbSignOut(firebaseAuth());
}
