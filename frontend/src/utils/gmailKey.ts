import { tr } from "../i18n";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { currentUser } from "../firebase/auth";
import { firestore } from "../firebase/app";

/**
 * The Gmail add-on's key: a long random code you paste into the add-on once.
 * Only its SHA-256 is stored (addonKeys/{hash} -> your uid), and the one on
 * your profile (gmailKeyHash) is replaced, and so stops working, when you
 * make a new one.
 */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hasGmailKey(): Promise<boolean> {
  const user = currentUser();
  if (!user) return false;
  const profile = await getDoc(doc(firestore(), "users", user.uid)).catch(() => null);
  return Boolean(profile?.data()?.gmailKeyHash);
}

export async function makeGmailKey(): Promise<string> {
  const user = currentUser();
  if (!user) throw new Error(tr("Sign in with Google first", "Najprej se prijavi z Googlom"));
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const key = "opk_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const hash = await sha256Hex(key);
  const db = firestore();
  const profileRef = doc(db, "users", user.uid);
  const old = (await getDoc(profileRef).catch(() => null))?.data()?.gmailKeyHash as string | undefined;
  await setDoc(doc(db, "addonKeys", hash), { uid: user.uid, createdAt: new Date().toISOString() });
  await setDoc(profileRef, { gmailKeyHash: hash }, { merge: true });
  if (old && old !== hash) await deleteDoc(doc(db, "addonKeys", old)).catch(() => {});
  return key;
}
