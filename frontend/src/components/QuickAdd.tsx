import { useState } from "react";
import { useCreateTask } from "../api/hooks";
import { parseNaturalDate } from "../utils/date";
import type { Priority } from "../api/types";

const PRIORITY_FLAG_RE = /\bp([1-4])\b/i;

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

  function submit() {
    const raw = text.trim();
    if (!raw) return;

    let priority: Priority = 1;
    let content = raw;
    const pm = content.match(PRIORITY_FLAG_RE);
    if (pm) {
      const n = parseInt(pm[1], 10); // p1..p4 as typed
      priority = (5 - n) as Priority; // p1 -> 4 (urgent) ... p4 -> 1
      content = content.replace(PRIORITY_FLAG_RE, "").trim();
    }

    const labelMatches = [...content.matchAll(/@(\w+)/g)].map((m) => m[1]);
    content = content.replace(/@(\w+)/g, "").trim();

    let due = defaultDue ? { ...defaultDue, isRecurring: false } : null;
    if (!due) {
      const parsed = parseNaturalDate(content);
      due = parsed.due;
      content = parsed.remaining;
    }

    content = content.replace(/\s+/g, " ").trim();
    if (!content) return;

    createTask.mutate({
      content,
      projectId,
      sectionId,
      priority,
      due,
      labels: labelMatches,
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
        placeholder="e.g. Draft proposal tomorrow p1 @work"
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
      <div className="quick-add-actions">
        <button className="btn btn-text" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={!text.trim()}>
          Add task
        </button>
      </div>
    </div>
  );
}
