import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { firebaseAuth } from "./app";
import { firebaseEnabled, useEmulator } from "./config";
import { isNativeApp } from "../dropbox/auth";

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
  if (isNativeApp) {
    // In the Android app Google's own account picker does the sign-in; the
    // web SDK then signs in to Firebase with the token it hands back, so the
    // rest of the app works exactly as on the website.
    const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
    const idToken = result.credential?.idToken;
    if (!idToken) throw new Error("Google sign-in was cancelled.");
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    return;
  }
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
  // Also forget the account in Android's picker, so another one can be chosen.
  if (isNativeApp) await FirebaseAuthentication.signOut().catch(() => {});
  await fbSignOut(firebaseAuth());
}
