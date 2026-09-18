import { getDropboxClient } from "./auth";
import type { AppData } from "../api/types";

const DATA_PATH = import.meta.env.VITE_DROPBOX_DATA_PATH || "/opravilko-data.json";
const WRITE_DEBOUNCE_MS = 1200;

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

export async function fetchAppData(): Promise<AppData> {
  const dbx = await getDropboxClient();
  try {
    const res = await dbx.filesDownload({ path: DATA_PATH });
    const blob = (res.result as unknown as { fileBlob: Blob }).fileBlob;
    const text = await blob.text();
    return JSON.parse(text) as AppData;
  } catch (err: any) {
    const summary: string = err?.error?.error_summary || err?.message || "";
    if (summary.includes("path/not_found")) {
      const fresh = emptyAppData();
      await saveAppData(fresh);
      return fresh;
    }
    throw err;
  }
}

export async function saveAppData(data: AppData): Promise<void> {
  const dbx = await getDropboxClient();
  await dbx.filesUpload({
    path: DATA_PATH,
    contents: JSON.stringify(data, null, 2),
    mode: { ".tag": "overwrite" },
    mute: true,
  });
}

let pendingData: AppData | null = null;
let writeTimer: number | null = null;

/** Debounced write: call on every local change, only hits the network a bit after typing/clicking stops. */
export function scheduleSave(data: AppData): void {
  pendingData = data;
  if (writeTimer) window.clearTimeout(writeTimer);
  writeTimer = window.setTimeout(() => {
    writeTimer = null;
    const toSave = pendingData;
    pendingData = null;
    if (toSave) {
      saveAppData(toSave).catch((err) => console.error("[dropbox] failed to save data:", err));
    }
  }, WRITE_DEBOUNCE_MS);
}

export function flushSave(): Promise<void> {
  if (writeTimer) {
    window.clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (pendingData) {
    const toSave = pendingData;
    pendingData = null;
    return saveAppData(toSave);
  }
  return Promise.resolve();
}
