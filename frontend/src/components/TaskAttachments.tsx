import { useEffect, useRef, useState } from "react";
import type { Attachment, Task } from "../api/types";
import { useAddAttachments, useRemoveAttachment } from "../api/hooks";
import {
  ATTACHMENT_BUDGET,
  AttachmentError,
  WARN_AT,
  formatSize,
  loadAttachment,
  uploadAttachment,
  watchStorageUsed,
} from "../firebase/attachments";
import { usingFirebase } from "../data/store";
import { FileIcon, PaperclipIcon, TrashIcon } from "./icons";
import { useToast } from "./ToastProvider";

/**
 * The Attachments section of the task details: photos as thumbnails, other
 * files as rows; add with the button or by dropping files anywhere on the
 * task. Opening a file loads it from storage and shows it in a new tab
 * (photos and PDFs) or downloads it.
 */
export default function TaskAttachments({ task }: { task: Task }) {
  const addAttachments = useAddAttachments();
  const removeAttachment = useRemoveAttachment();
  const showToast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ name: string; share: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => (usingFirebase() ? watchStorageUsed(setUsed) : undefined), []);

  // Dropping files anywhere on the open task attaches them.
  useEffect(() => {
    if (!usingFirebase()) return;
    const panel = document.querySelector(".detail-panel, .task-detail");
    const target: HTMLElement | Document = (panel as HTMLElement) || document;
    const over = (e: Event) => {
      const de = e as DragEvent;
      if (!de.dataTransfer?.types.includes("Files")) return;
      de.preventDefault();
      setDragOver(true);
    };
    const leave = (e: Event) => {
      if ((e as DragEvent).relatedTarget === null) setDragOver(false);
    };
    const drop = (e: Event) => {
      const de = e as DragEvent;
      if (!de.dataTransfer?.files.length) return;
      de.preventDefault();
      setDragOver(false);
      void addFiles(de.dataTransfer.files);
    };
    target.addEventListener("dragover", over);
    target.addEventListener("dragleave", leave);
    target.addEventListener("drop", drop);
    return () => {
      target.removeEventListener("dragover", over);
      target.removeEventListener("dragleave", leave);
      target.removeEventListener("drop", drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  if (!usingFirebase()) {
    return (
      <div className="attachments">
        <div className="attachments-title">Attachments</div>
        <p className="attachments-note">Attachments need Google sign-in (Settings → Account).</p>
      </div>
    );
  }

  async function addFiles(files: FileList | File[]) {
    setError(null);
    const added: Attachment[] = [];
    for (const file of Array.from(files)) {
      setUploading({ name: file.name, share: 0 });
      try {
        added.push(await uploadAttachment(task.id, file, (share) => setUploading({ name: file.name, share })));
      } catch (err) {
        setError(err instanceof AttachmentError ? err.message : `Couldn't attach “${file.name}”.`);
        break;
      }
    }
    setUploading(null);
    if (added.length) addAttachments.mutate({ id: task.id, attachments: added });
  }

  async function open(att: Attachment) {
    setOpening(att.id);
    try {
      const blob = await loadAttachment(att);
      const url = URL.createObjectURL(blob);
      // Photos, PDFs and text open in a new tab; anything else downloads.
      if (/^(image\/|application\/pdf|text\/)/.test(att.type)) {
        window.open(url, "_blank", "noopener");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = att.name;
        a.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      showToast({ message: `Couldn't open “${att.name}”. Check your connection.` });
    } finally {
      setOpening(null);
    }
  }

  function remove(att: Attachment) {
    removeAttachment.mutate({ taskId: task.id, attachmentId: att.id });
    showToast({
      message: `Removed “${att.name}”`,
      actionLabel: "Undo",
      onAction: () => addAttachments.mutate({ id: task.id, attachments: [att] }),
    });
  }

  const atts = task.attachments || [];
  const photos = atts.filter((a) => a.thumb);
  const files = atts.filter((a) => !a.thumb);
  const nearlyFull = used >= ATTACHMENT_BUDGET * WARN_AT;

  return (
    <div className={`attachments ${dragOver ? "is-drag-over" : ""}`}>
      <div className="attachments-title">
        Attachments
        <button className="btn btn-text attachments-add" onClick={() => inputRef.current?.click()} disabled={Boolean(uploading)}>
          <PaperclipIcon width={14} height={14} /> Add file
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {photos.length > 0 && (
        <div className="attachments-photos">
          {photos.map((a) => (
            <div key={a.id} className="attachment-photo">
              <button onClick={() => void open(a)} title={`${a.name} · ${formatSize(a.size)}`} disabled={opening === a.id}>
                <img src={a.thumb} alt={a.name} />
              </button>
              <button className="attachment-remove" onClick={() => remove(a)} aria-label={`Remove ${a.name}`}>
                <TrashIcon width={12} height={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {files.map((a) => (
        <div key={a.id} className="attachment-file">
          <FileIcon width={16} height={16} />
          <button className="attachment-name" onClick={() => void open(a)} disabled={opening === a.id}>
            {opening === a.id ? "Opening…" : a.name}
          </button>
          <span className="attachment-size">{formatSize(a.size)}</span>
          <button className="attachment-remove inline" onClick={() => remove(a)} aria-label={`Remove ${a.name}`}>
            <TrashIcon width={13} height={13} />
          </button>
        </div>
      ))}

      {uploading && (
        <div className="attachment-progress">
          <span>Uploading {uploading.name}…</span>
          <i style={{ width: `${Math.round(uploading.share * 100)}%` }} />
        </div>
      )}
      {error && <div className="attachments-error">{error}</div>}
      {atts.length === 0 && !uploading && !error && (
        <p className="attachments-note">Photos, PDFs or documents up to 10 MB. You can also drop files onto the task.</p>
      )}
      {nearlyFull && (
        <p className="attachments-note warn">
          Attachments are almost full: {formatSize(used)} of {formatSize(ATTACHMENT_BUDGET)}. Settings → Storage shows
          what takes the most space.
        </p>
      )}
    </div>
  );
}
