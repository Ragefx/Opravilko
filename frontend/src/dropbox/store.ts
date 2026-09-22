import { getDropboxClient } from "./auth";
import type { AppData } from "../api/types";

const DATA_PATH = import.meta.env.VITE_DROPBOX_DATA_PATH || "/opravilko-data.json";
const WRITE_DEBOUNCE_MS = 1200;

export type SyncStatus = "idle" | "saving" | "saved" | "error" | "conflict" | "offline";

export interface SyncState {
  status: SyncStatus;
  /** Human-readable detail for "error", e.g. the Dropbox message. */
  message?: string;
  /** True while a change is queued but not yet written. */
  pending: boolean;
}

let syncState: SyncState = { status: "idle", pending: false };
const listeners = new Set<(s: SyncState) => void>();

function setSyncState(next: Partial<SyncState>) {
  syncState = { ...syncState, ...next };
  listeners.forEach((l) => l(syncState));
}

export function subscribeSync(listener: (s: SyncState) => void): () => void {
  listeners.add(listener);
  listener(syncState);
  return () => {
    listeners.delete(listener);
  };
}

export function getSyncState(): SyncState {
  return syncState;
}

/**
 * The Dropbox revision of the data file as we last saw it. Uploads are sent with
 * mode "update" against this rev so a write from another device/tab is rejected
 * rather than silently overwritten.
 */
let knownRev: string | null = null;

function emptyAppData(): AppData {
  return {
    version: 1,
    projects: [
      { id: "inbox", name: "Inbox", color: "grey", order: 0, isFavorite: false, isInboxProject: true, parentId: null },
    ],
    sections: [],
    labels: [],
    filters: [],
    tasks: [],
  };
}

// ---- local copy, for working offline ----
// The last data known to match Dropbox (with its rev), and any edits not yet
// uploaded. Both live in localStorage so a reload or app restart while
// offline neither loses edits nor needs the network to show your tasks.
const CACHE_KEY = "opravilko.cache";
const PENDING_KEY = "opravilko.pending";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or disabled -- online syncing still works */
  }
}

function writeCache(data: AppData, rev: string | null): void {
  writeJson(CACHE_KEY, { data, rev });
}

/** True for failures that mean "couldn't reach the network", not a real Dropbox error. */
function isNetworkError(err: any): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg: string = err?.message || "";
  return err instanceof TypeError || /failed to fetch|networkerror|load failed|network request failed/i.test(msg);
}

function isConflict(err: any): boolean {
  const summary: string = err?.error?.error_summary || err?.message || "";
  return summary.includes("conflict");
}

export async function fetchAppData(): Promise<AppData> {
  const unsent = readJson<AppData>(PENDING_KEY);
  const cached = readJson<{ data: AppData; rev: string | null }>(CACHE_KEY);
  let remote: AppData;
  let remoteRev: string | null;
  try {
    const dbx = await getDropboxClient();
    const res = await dbx.filesDownload({ path: DATA_PATH });
    const result = res.result as unknown as { fileBlob: Blob; rev?: string };
    remoteRev = result.rev ?? null;
    remote = JSON.parse(await result.fileBlob.text()) as AppData;
  } catch (err: any) {
    const summary: string = err?.error?.error_summary || err?.message || "";
    if (summary.includes("path/not_found")) {
      const fresh = unsent ?? emptyAppData();
      knownRev = null;
      await saveAppData(fresh);
      return fresh;
    }
    if (isNetworkError(err) && (unsent || cached)) {
      // Offline: carry on from the local copy; edits queue up until we're back.
      knownRev = cached?.rev ?? null;
      if (unsent) pendingData = unsent;
      setSyncState({ status: "offline", pending: Boolean(unsent) });
      return unsent ?? cached!.data;
    }
    throw err;
  }

  knownRev = remoteRev;
  if (unsent) {
    // Edits made offline last time. If Dropbox hasn't changed since the copy
    // they were made on, they're simply the newest data -- upload them. If it
    // has, let the user choose, same as any other conflict.
    pendingData = unsent;
    if (cached && cached.rev === remoteRev) {
      setSyncState({ pending: true });
      window.setTimeout(() => void flushSave(), 0);
    } else {
      setSyncState({ status: "conflict", pending: true });
    }
    return unsent;
  }
  writeCache(remote, remoteRev);
  return remote;
}

export async function saveAppData(data: AppData, { force = false } = {}): Promise<void> {
  const dbx = await getDropboxClient();
  const mode =
    knownRev && !force ? ({ ".tag": "update", update: knownRev } as const) : ({ ".tag": "overwrite" } as const);
  const res = await dbx.filesUpload({
    path: DATA_PATH,
    contents: JSON.stringify(data, null, 2),
    mode,
    mute: true,
  });
  knownRev = (res.result as { rev?: string }).rev ?? knownRev;
  writeCache(data, knownRev);
}

let pendingData: AppData | null = null;
let writeTimer: number | null = null;
let inFlight: Promise<void> | null = null;

async function writeNow(data: AppData, opts?: { force?: boolean }): Promise<void> {
  setSyncState({ status: "saving" });
  try {
    await saveAppData(data, opts);
    // Only clear the stored copy if nothing newer was queued meanwhile.
    if (pendingData === null) writeJson(PENDING_KEY, null);
    setSyncState({ status: "saved", message: undefined, pending: pendingData !== null });
  } catch (err: any) {
    if (isNetworkError(err)) {
      // Keep it queued; the "online" listener retries when the network returns.
      if (pendingData === null) pendingData = data;
      setSyncState({ status: "offline", pending: true });
    } else if (isConflict(err)) {
      // Someone else (another tab, another device) wrote since we last read.
      // Hold onto the local copy so the user can still choose to overwrite.
      pendingData = data;
      setSyncState({ status: "conflict", pending: true });
    } else {
      pendingData = data;
      setSyncState({
        status: "error",
        message: err?.error?.error_summary || err?.message || "Unknown error",
        pending: true,
      });
    }
    throw err;
  }
}

/** Debounced write: call on every local change, only hits the network a bit after typing/clicking stops. */
export function scheduleSave(data: AppData): void {
  pendingData = data;
  writeJson(PENDING_KEY, data);
  setSyncState({ pending: true });
  if (writeTimer) window.clearTimeout(writeTimer);
  writeTimer = window.setTimeout(() => {
    writeTimer = null;
    const toSave = pendingData;
    if (!toSave) return;
    pendingData = null;
    inFlight = writeNow(toSave).catch(() => {
      /* state already reflects the failure; pendingData was restored */
    });
  }, WRITE_DEBOUNCE_MS);
}

/** Writes any queued change immediately. */
export function flushSave(): Promise<void> {
  if (writeTimer) {
    window.clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (pendingData) {
    const toSave = pendingData;
    pendingData = null;
    inFlight = writeNow(toSave).catch(() => {});
    return inFlight;
  }
  return inFlight ?? Promise.resolve();
}

/** Retries a failed write. */
export function retrySave(): Promise<void> {
  if (!pendingData) return Promise.resolve();
  return flushSave();
}

/**
 * Resolves a conflict by discarding the remote version and writing ours on top.
 * Only offered explicitly -- never automatic.
 */
export async function forceOverwrite(): Promise<void> {
  const toSave = pendingData;
  if (!toSave) return;
  pendingData = null;
  await writeNow(toSave, { force: true }).catch(() => {});
}

/** Drops the local queued write so a fresh fetch can take over after a conflict. */
export function discardPending(): void {
  pendingData = null;
  knownRev = null;
  writeJson(PENDING_KEY, null);
  setSyncState({ status: "idle", pending: false, message: undefined });
}

export function hasPendingWrite(): boolean {
  return pendingData !== null || syncState.status === "saving";
}

/**
 * Debounced writes mean a change made moments before the tab closes would never
 * reach Dropbox. Flush when the page is hidden, and warn if a write is still
 * outstanding when the user tries to leave.
 */
export function installSyncGuards(): void {
  window.addEventListener("online", () => {
    if (pendingData) void flushSave();
    else if (syncState.status === "offline") setSyncState({ status: "idle" });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && pendingData) void flushSave();
  });
  window.addEventListener("pagehide", () => {
    if (pendingData) void flushSave();
  });
  window.addEventListener("beforeunload", (e) => {
    // Offline edits are already kept on this device, so only warn when an
    // upload that could have gone through is still outstanding.
    if (hasPendingWrite() && syncState.status !== "offline") {
      e.preventDefault();
      // Legacy browsers need returnValue set to trigger the confirmation.
      e.returnValue = "";
    }
  });
}
