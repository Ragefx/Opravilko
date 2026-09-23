import type { QueryClient } from "@tanstack/react-query";
import type { AppData } from "../api/types";
import * as dropbox from "../dropbox/store";
import type { SyncState } from "../dropbox/store";
import { isConnected as dropboxConnected } from "../dropbox/auth";
import { currentUser } from "../firebase/auth";
import { FirestoreSync } from "../firebase/sync";

/**
 * Where the app's data lives: Firebase when signed in with Google, otherwise
 * the older single-file Dropbox storage. Everything outside this file goes
 * through here, so the rest of the app doesn't care which one is in use.
 */

const BOOTSTRAP_KEY = ["bootstrap"];
let queryClient: QueryClient | null = null;
let session: FirestoreSync | null = null;
let sessionUid: string | null = null;

export function bindQueryClient(qc: QueryClient) {
  queryClient = qc;
}

export function usingFirebase(): boolean {
  return currentUser() !== null;
}

/** Signed in one way or the other. */
export function isSignedIn(): boolean {
  return usingFirebase() || dropboxConnected();
}

function firebaseSession(): FirestoreSync {
  const user = currentUser()!;
  if (session && sessionUid === user.uid) return session;
  session?.stop();
  sessionUid = user.uid;
  session = new FirestoreSync(user, (data) => queryClient?.setQueryData(BOOTSTRAP_KEY, data));
  const s = session;
  s.subscribeSync(relaySync);
  void s.start();
  return s;
}

export function activeSession(): FirestoreSync | null {
  return usingFirebase() ? firebaseSession() : null;
}

export async function fetchAppData(): Promise<AppData> {
  if (!usingFirebase()) return dropbox.fetchAppData();
  const s = firebaseSession();
  await s.ready;
  // After the first load the live listeners keep the cache current; a
  // refetch (e.g. on resume) just returns the latest assembled state.
  return queryClient?.getQueryData<AppData>(BOOTSTRAP_KEY) ?? (await s.ready);
}

export function scheduleSave(data: AppData): void {
  if (usingFirebase()) firebaseSession().save(data);
  else dropbox.scheduleSave(data);
}

/** True once a signed-in Firebase user has imported their data or chosen to start fresh. */
export function needsSetup(): boolean {
  return usingFirebase() && !firebaseSession().setupDone;
}

/** Called on sign-out: stops listening and forgets the data shown on screen. */
export function endSession() {
  session?.stop();
  session = null;
  sessionUid = null;
  queryClient?.clear();
}

// ---------- sync status, from whichever storage is active ----------

let syncState: SyncState = { status: "idle", pending: false };
const syncListeners = new Set<(s: SyncState) => void>();

function relaySync(s: SyncState) {
  syncState = s;
  syncListeners.forEach((l) => l(s));
}

let dropboxRelayed = false;
export function subscribeSync(listener: (s: SyncState) => void): () => void {
  if (!dropboxRelayed) {
    dropboxRelayed = true;
    dropbox.subscribeSync((s) => {
      if (!usingFirebase()) relaySync(s);
    });
  }
  syncListeners.add(listener);
  listener(syncState);
  return () => {
    syncListeners.delete(listener);
  };
}

export function hasPendingWrite(): boolean {
  return usingFirebase() ? (session?.hasPendingWrite() ?? false) : dropbox.hasPendingWrite();
}

export function installSyncGuards(): void {
  dropbox.installSyncGuards();
  const onNet = () => session?.onNetworkChange();
  window.addEventListener("online", onNet);
  window.addEventListener("offline", onNet);
}

// Dropbox-only conflict handling, re-exported for the sync banner.
export { discardPending, forceOverwrite, retrySave } from "../dropbox/store";
export type { SyncState } from "../dropbox/store";
