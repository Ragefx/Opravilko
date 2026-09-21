import { getDropboxClient } from "./auth";
import type { AppData } from "../api/types";

const DATA_PATH = import.meta.env.VITE_DROPBOX_DATA_PATH || "/opravilko-data.json";
const WRITE_DEBOUNCE_MS = 1200;

export type SyncStatus = "idle" | "saving" | "saved" | "error" | "conflict";

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

function isConflict(err: any): boolean {
  const summary: string = err?.error?.error_summary || err?.message || "";
  return summary.includes("conflict");
}

export async function fetchAppData(): Promise<AppData> {
  const dbx = await getDropboxClient();
  try {
    const res = await dbx.filesDownload({ path: DATA_PATH });
    const result = res.result as unknown as { fileBlob: Blob; rev?: string };
    knownRev = result.rev ?? null;
    const text = await result.fileBlob.text();
    return JSON.parse(text) as AppData;
  } catch (err: any) {
    const summary: string = err?.error?.error_summary || err?.message || "";
    if (summary.includes("path/not_found")) {
      const fresh = emptyAppData();
      knownRev = null;
      await saveAppData(fresh);
      return fresh;
    }
    throw err;
  }
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
}

let pendingData: AppData | null = null;
let writeTimer: number | null = null;
let inFlight: Promise<void> | null = null;

async function writeNow(data: AppData, opts?: { force?: boolean }): Promise<void> {
  setSyncState({ status: "saving" });
  try {
    await saveAppData(data, opts);
    setSyncState({ status: "saved", message: undefined, pending: pendingData !== null });
  } catch (err: any) {
    if (isConflict(err)) {
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
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && pendingData) void flushSave();
  });
  window.addEventListener("pagehide", () => {
    if (pendingData) void flushSave();
  });
  window.addEventListener("beforeunload", (e) => {
    if (hasPendingWrite()) {
      e.preventDefault();
      // Legacy browsers need returnValue set to trigger the confirmation.
      e.returnValue = "";
    }
  });
}
