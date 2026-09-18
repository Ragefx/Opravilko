import { getDropboxClient } from "./dropboxClient.js";
import { AppData, emptyAppData } from "./types.js";

const DATA_PATH = process.env.DROPBOX_DATA_PATH || "/opravilko-data.json";
const WRITE_DEBOUNCE_MS = 1500;

let cache: AppData | null = null;
let writeTimer: NodeJS.Timeout | null = null;
let pendingWrite: Promise<void> | null = null;
let loadingPromise: Promise<AppData> | null = null;

async function downloadFromDropbox(): Promise<AppData> {
  const dbx = getDropboxClient();
  try {
    const res = await dbx.filesDownload({ path: DATA_PATH });
    // @ts-expect-error fileBinary exists on the node response at runtime
    const binary: Buffer = res.result.fileBinary;
    const text = Buffer.isBuffer(binary) ? binary.toString("utf-8") : String(binary);
    return JSON.parse(text) as AppData;
  } catch (err: any) {
    const errSummary = err?.error?.error_summary || "";
    if (errSummary.includes("path/not_found") || err?.status === 409) {
      const fresh = emptyAppData();
      await uploadToDropbox(fresh);
      return fresh;
    }
    throw err;
  }
}

async function uploadToDropbox(data: AppData): Promise<void> {
  const dbx = getDropboxClient();
  const contents = JSON.stringify(data, null, 2);
  await dbx.filesUpload({
    path: DATA_PATH,
    contents,
    mode: { ".tag": "overwrite" },
    mute: true,
  });
}

export async function getData(): Promise<AppData> {
  if (cache) return cache;
  if (!loadingPromise) {
    loadingPromise = downloadFromDropbox().then((data) => {
      cache = data;
      return data;
    });
  }
  return loadingPromise;
}

function scheduleWrite() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (!cache) return;
    pendingWrite = uploadToDropbox(cache).catch((err) => {
      console.error("[store] failed to write data.json to Dropbox:", err?.message || err);
    });
  }, WRITE_DEBOUNCE_MS);
}

/** Apply a synchronous mutation to the in-memory data, then persist (debounced) to Dropbox. */
export async function mutate<T>(fn: (data: AppData) => T): Promise<T> {
  const data = await getData();
  const result = fn(data);
  scheduleWrite();
  return result;
}

/** Force any pending write to flush immediately. Useful before process shutdown. */
export async function flush(): Promise<void> {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
    if (cache) {
      await uploadToDropbox(cache);
    }
  }
  if (pendingWrite) await pendingWrite;
}
