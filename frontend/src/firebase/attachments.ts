import {
  Bytes,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { nanoid } from "nanoid";
import { firestore } from "./app";
import { currentUser } from "./auth";
import type { Attachment } from "../api/types";

/**
 * Attachments, stored in Firestore itself (free, no card needed).
 *
 * A file's bytes are split into chunks of under 1 MB (Firestore's document
 * limit): attachments/{id} describes it, attachments/{id}/chunks/{000..}
 * hold the pieces. The task keeps a small list of its attachments (name,
 * size, a thumbnail for photos), so lists never load the files themselves.
 *
 * The free database is 1 GB for everything, tasks included, and if it ever
 * filled up no one could save anything. So attachments get their own
 * budget, well below that: meta/storage counts the bytes in use, and the
 * security rules refuse an upload that would take it past the budget.
 */

/** The attachments budget; the rest of the 1 GB stays free for tasks. */
export const ATTACHMENT_BUDGET = 700 * 1024 * 1024;
/** Warn when attachments reach this share of the budget. */
export const WARN_AT = 0.8;
export const MAX_FILE = 10 * 1024 * 1024;
const CHUNK = 900_000;
/** Chunks per write batch: well under Firestore's 10 MB request limit. */
const CHUNKS_PER_BATCH = 5;

export class AttachmentError extends Error {}

// ---------- space used ----------

export function watchStorageUsed(onChange: (bytes: number) => void): () => void {
  return onSnapshot(
    doc(firestore(), "meta", "storage"),
    (snap) => onChange((snap.data()?.bytes as number) || 0),
    () => onChange(0)
  );
}

async function storageUsed(): Promise<number> {
  const snap = await getDoc(doc(firestore(), "meta", "storage"));
  return (snap.data()?.bytes as number) || 0;
}

// ---------- preparing a file ----------

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Not a readable image"));
    };
    img.src = url;
  });
}

function drawScaled(img: HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d")!;
  // JPEG has no transparency: put transparent PNGs on white.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Photos are shrunk to at most 1600px (usually 200-400 KB) and get a small
 * thumbnail; everything else is stored as it is. Formats the browser can't
 * draw (e.g. HEIC on most browsers) are kept as they are too.
 */
async function prepare(file: File): Promise<{ blob: Blob; name: string; type: string; thumb?: string }> {
  const shrinkable = /^image\/(jpeg|png|webp|bmp)$/.test(file.type);
  if (!shrinkable) return { blob: file, name: file.name, type: file.type || "application/octet-stream" };
  try {
    const img = await loadImage(file);
    const big = await toBlob(drawScaled(img, 1600), 0.82);
    const thumb = drawScaled(img, 240).toDataURL("image/jpeg", 0.6);
    // Keep the original if "shrinking" didn't make it smaller.
    if (!big || big.size >= file.size) return { blob: file, name: file.name, type: file.type, thumb };
    return { blob: big, name: file.name.replace(/\.(png|webp|bmp|jpe?g)$/i, "") + ".jpg", type: "image/jpeg", thumb };
  } catch {
    return { blob: file, name: file.name, type: file.type };
  }
}

// ---------- upload / download / delete ----------

/**
 * Stores a file for a task and returns its description, to be added to the
 * task's `attachments`. Checks the size and the budget first.
 */
export async function uploadAttachment(taskId: string, file: File, onProgress?: (share: number) => void): Promise<Attachment> {
  const user = currentUser();
  if (!user) throw new AttachmentError("Attachments need Google sign-in.");
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new AttachmentError("You're offline. Attach files once you're back online.");
  }
  const prepared = await prepare(file);
  if (prepared.blob.size > MAX_FILE) {
    throw new AttachmentError(`“${file.name}” is ${(prepared.blob.size / 1048576).toFixed(1)} MB; the limit is 10 MB per file.`);
  }
  const used = await storageUsed();
  if (used + prepared.blob.size > ATTACHMENT_BUDGET) {
    throw new AttachmentError(
      `Not enough space: attachments use ${(used / 1048576).toFixed(0)} of ${ATTACHMENT_BUDGET / 1048576} MB. ` +
        "Free some up in Settings → Storage."
    );
  }

  const db = firestore();
  const id = nanoid();
  const bytes = new Uint8Array(await prepared.blob.arrayBuffer());
  const chunkCount = Math.max(1, Math.ceil(bytes.length / CHUNK));
  const attRef = doc(db, "attachments", id);
  await setDoc(attRef, {
    taskId,
    ownerUid: user.uid,
    name: prepared.name,
    type: prepared.type,
    size: bytes.length,
    chunkCount,
    status: "uploading",
    createdAt: new Date().toISOString(),
  });
  try {
    for (let first = 0; first < chunkCount; first += CHUNKS_PER_BATCH) {
      const batch = writeBatch(db);
      for (let i = first; i < Math.min(chunkCount, first + CHUNKS_PER_BATCH); i++) {
        batch.set(doc(db, "attachments", id, "chunks", String(i).padStart(3, "0")), {
          data: Bytes.fromUint8Array(bytes.subarray(i * CHUNK, (i + 1) * CHUNK)),
        });
      }
      await batch.commit();
      onProgress?.(Math.min(1, (first + CHUNKS_PER_BATCH) / chunkCount));
    }
    // Counted only once it's all there; the rules refuse this if it would
    // go over the budget (e.g. both of you uploading at once).
    const done = writeBatch(db);
    done.update(attRef, { status: "ready" });
    done.set(doc(db, "meta", "storage"), { bytes: increment(bytes.length) }, { merge: true });
    await done.commit();
  } catch (err) {
    void removeBlob(id, 0).catch(() => {});
    throw err instanceof AttachmentError ? err : new AttachmentError("Upload failed. Check your connection and try again.");
  }
  return {
    id,
    name: prepared.name,
    type: prepared.type,
    size: bytes.length,
    addedBy: user.uid,
    addedAt: new Date().toISOString(),
    ...(prepared.thumb ? { thumb: prepared.thumb } : {}),
  };
}

const blobCache = new Map<string, Blob>();

/** The file's contents (fetched once per session, then kept in memory). */
export async function loadAttachment(att: Attachment): Promise<Blob> {
  const cached = blobCache.get(att.id);
  if (cached) return cached;
  const snap = await getDocs(collection(firestore(), "attachments", att.id, "chunks"));
  const parts = snap.docs
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((d) => (d.data().data as Bytes).toUint8Array());
  const blob = new Blob(parts as BlobPart[], { type: att.type });
  blobCache.set(att.id, blob);
  return blob;
}

/** Deletes a file's stored contents and gives its space back. */
async function removeBlob(id: string, size: number): Promise<void> {
  const db = firestore();
  const chunks = await getDocs(collection(db, "attachments", id, "chunks"));
  const refs = chunks.docs.map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  const last = writeBatch(db);
  last.delete(doc(db, "attachments", id));
  if (size > 0) last.set(doc(db, "meta", "storage"), { bytes: increment(-size) }, { merge: true });
  await last.commit();
  blobCache.delete(id);
}

export function deleteAttachmentBlobs(atts: Attachment[]): Promise<void> {
  return Promise.all(atts.map((a) => removeBlob(a.id, a.size))).then(() => {});
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(bytes < 10 * 1048576 ? 1 : 0)} MB`;
}
