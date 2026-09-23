import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAddAttachments, useBootstrap, useCreateTask } from "../api/hooks";
import { hasPendingWrite, usingFirebase } from "../data/store";
import { uploadAttachment } from "../firebase/attachments";
import { listenForShares, sharedImageFile, type SharedContent } from "../native/share";
import { queueShoppingAdd } from "../utils/shopping";
import { useToast } from "./ToastProvider";
import { XIcon } from "./icons";

/** A shared link usually comes as the page title (subject) plus its address (text). */
function titleAndNotes(s: SharedContent): { title: string; notes: string } {
  const text = (s.text ?? "").trim();
  const subject = (s.subject ?? "").trim();
  if (subject && !text.startsWith(subject)) return { title: subject, notes: text };
  const [first = "", ...rest] = text.split("\n");
  return { title: first.trim(), notes: rest.join("\n").trim() };
}

/** Waits (up to ~10 s) until the new task has reached the database, so a photo can go on it. */
async function taskSaved(): Promise<void> {
  for (let i = 0; i < 40 && hasPendingWrite(); i++) await new Promise((r) => setTimeout(r, 250));
}

/**
 * "Share to Opravilko": something shared from another app (a link, text,
 * photos) becomes a task in the chosen project, or items on a shopping list.
 */
export default function ShareSheet() {
  const [shared, setShared] = useState<{ n: number; content: SharedContent } | null>(null);
  useEffect(() => listenForShares((content) => setShared((s) => ({ n: (s?.n ?? 0) + 1, content }))), []);
  if (!shared) return null;
  return <ShareDialog key={shared.n} shared={shared.content} onClose={() => setShared(null)} />;
}

function ShareDialog({ shared, onClose }: { shared: SharedContent; onClose: () => void }) {
  const { data } = useBootstrap();
  const createTask = useCreateTask();
  const addAttachments = useAddAttachments();
  const showToast = useToast();
  const navigate = useNavigate();
  const initial = titleAndNotes(shared);
  const [title, setTitle] = useState(initial.title || (shared.images?.length ? "Photo" : ""));
  const [notes, setNotes] = useState(initial.notes);
  const [busy, setBusy] = useState(false);

  const projects = [...(data?.projects ?? [])].sort(
    (a, b) => Number(!!b.isInboxProject) - Number(!!a.isInboxProject) || a.order - b.order
  );
  const shopping = projects.find((p) => p.viewStyle === "shopping");
  const [projectId, setProjectId] = useState(() => projects.find((p) => p.isInboxProject)?.id ?? "inbox");
  const target = projects.find((p) => p.id === projectId);
  const toShopping = target?.viewStyle === "shopping";
  const images = shared.images ?? [];
  const canAttach = usingFirebase();

  function routeTo(id: string) {
    const p = projects.find((x) => x.id === id);
    if (p?.viewStyle === "shopping") return "/app/shopping";
    return p?.isInboxProject ? "/app/inbox" : `/app/project/${encodeURIComponent(id)}`;
  }

  async function add() {
    if (toShopping) {
      // The list itself adds them, so amounts count up as usual.
      navigate(routeTo(projectId));
      setTimeout(() => queueShoppingAdd(projectId, [title, notes].filter(Boolean).join("\n")), 0);
      onClose();
      return;
    }
    if (!title.trim()) return;
    setBusy(true);
    const task = await createTask.mutateAsync({ content: title.trim(), description: notes.trim(), projectId });
    let failed = "";
    if (images.length && canAttach) {
      await taskSaved();
      const added = [];
      for (const image of images) {
        try {
          added.push(await uploadAttachment(task.id, await sharedImageFile(image)));
        } catch (err) {
          failed = (err as Error).message || "A photo couldn't be attached.";
        }
      }
      if (added.length) addAttachments.mutate({ id: task.id, attachments: added });
    }
    setBusy(false);
    onClose();
    showToast({
      message: failed || `Added to ${target?.name ?? "Inbox"}`,
      actionLabel: "Open",
      onAction: () => navigate(`${routeTo(projectId)}?open=${encodeURIComponent(task.id)}`),
    });
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="modal share-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add to Opravilko">
        <div className="settings-head">
          <h3>Add to Opravilko</h3>
          <button className="sidebar-icon-btn" onClick={onClose} aria-label="Close" disabled={busy}>
            <XIcon width={18} height={18} />
          </button>
        </div>
        <label className="share-field">
          <span>Add to</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.viewStyle === "shopping" ? " (shopping list)" : ""}
              </option>
            ))}
          </select>
        </label>
        {shopping && !toShopping && (
          <button className="btn btn-text share-shopping-hint" onClick={() => setProjectId(shopping.id)}>
            🛒 Put it on {shopping.name} instead
          </button>
        )}
        {toShopping ? (
          <label className="share-field">
            <span>Items (one per line or comma)</span>
            <textarea rows={5} value={[title, notes].filter(Boolean).join("\n")} onChange={(e) => {
              setTitle(e.target.value);
              setNotes("");
            }} />
          </label>
        ) : (
          <>
            <label className="share-field">
              <span>Task</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </label>
            <label className="share-field">
              <span>Notes</span>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            {images.length > 0 && (
              <div className="share-images">
                {images.map((img, i) => (
                  <img key={i} src={img.dataUrl} alt={img.name} />
                ))}
                {!canAttach && <p className="settings-note">Photos can be attached with Google sign-in only.</p>}
              </div>
            )}
          </>
        )}
        <div className="modal-actions">
          <button className="btn btn-text" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void add()} disabled={busy || !title.trim()}>
            {busy ? "Adding…" : toShopping ? "Add to list" : "Add task"}
          </button>
        </div>
      </div>
    </div>
  );
}
