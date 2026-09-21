import { useState } from "react";
import { useCreateTask } from "../api/hooks";
import { parseQuickAddInput } from "../utils/quickAddParse";
import { formatDueLabel } from "../utils/date";
import { PRIORITY_META } from "../utils/priority";

export default function QuickAdd({
  projectId,
  sectionId = null,
  defaultDue = null,
}: {
  projectId: string;
  sectionId?: string | null;
  defaultDue?: { date: string; string: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const createTask = useCreateTask();

  const preview = text.trim() ? parseQuickAddInput(text, defaultDue) : null;

  function submit() {
    if (!text.trim()) return;
    const parsed = parseQuickAddInput(text, defaultDue);
    if (!parsed.content) return;

    createTask.mutate({
      content: parsed.content,
      projectId,
      sectionId,
      priority: parsed.priority,
      due: parsed.due,
      labels: parsed.labels,
    });
    setText("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button className="add-task-trigger" onClick={() => setOpen(true)}>
        <span className="plus">+</span> Add task
      </button>
    );
  }

  return (
    <div className="quick-add">
      <input
        autoFocus
        placeholder="e.g. Draft proposal every monday p1 @work"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setOpen(false);
            setText("");
          }
        }}
      />
      {preview && (preview.due || preview.labels.length > 0 || preview.priority !== 1) && (
        <div className="quick-add-preview">
          {preview.due && <span className="chip">{formatDueLabel(preview.due)}</span>}
          {preview.priority !== 1 && (
            <span className="chip" style={{ color: PRIORITY_META[preview.priority].color }}>
              {PRIORITY_META[preview.priority].label}
            </span>
          )}
          {preview.labels.map((l) => (
            <span key={l} className="chip">
              @{l}
            </span>
          ))}
        </div>
      )}
      <div className="quick-add-actions">
        <button className="btn btn-text" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={!preview?.content}>
          Add task
        </button>
      </div>
    </div>
  );
}
