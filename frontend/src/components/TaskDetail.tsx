import { useEffect, useState } from "react";
import type { Task } from "../api/types";
import { useBootstrap, useDeleteTask, useUpdateTask } from "../api/hooks";
import { PRIORITY_META, PRIORITY_ORDER } from "../utils/priority";
import { makeDue, makeDueFromDateString } from "../utils/date";
import { FlagIcon, CalendarIcon, TrashIcon, XIcon } from "./icons";

function timeFromDatetime(datetime?: string): string {
  if (!datetime) return "";
  const d = new Date(datetime);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const { data } = useBootstrap();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const [content, setContent] = useState(task.content);
  const [description, setDescription] = useState(task.description);

  useEffect(() => {
    setContent(task.content);
    setDescription(task.description);
  }, [task.id]);

  function saveContent() {
    if (content.trim() && content !== task.content) {
      updateTask.mutate({ id: task.id, content: content.trim() });
    }
  }

  function saveDescription() {
    if (description !== task.description) {
      updateTask.mutate({ id: task.id, description });
    }
  }

  function setPriority(p: (typeof PRIORITY_ORDER)[number]) {
    updateTask.mutate({ id: task.id, priority: p });
  }

  function setDueOffset(days: number | null) {
    if (days === null) {
      updateTask.mutate({ id: task.id, due: null });
      return;
    }
    const date = new Date();
    date.setDate(date.getDate() + days);
    const label = days === 0 ? "Today" : days === 1 ? "Tomorrow" : date.toDateString();
    updateTask.mutate({ id: task.id, due: makeDue(date, label) });
  }

  function setProject(projectId: string) {
    updateTask.mutate({ id: task.id, projectId, sectionId: null });
  }

  function setManualDate(dateStr: string) {
    if (!dateStr) {
      updateTask.mutate({ id: task.id, due: null });
      return;
    }
    const timeStr = timeFromDatetime(task.due?.datetime);
    updateTask.mutate({ id: task.id, due: makeDueFromDateString(dateStr, timeStr || undefined) });
  }

  function setManualTime(timeStr: string) {
    const dateStr = task.due?.date;
    if (!dateStr) return; // pick a date first
    updateTask.mutate({ id: task.id, due: makeDueFromDateString(dateStr, timeStr || undefined) });
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button className="btn-text" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <textarea
          className="detail-title"
          value={content}
          rows={2}
          onChange={(e) => setContent(e.target.value)}
          onBlur={saveContent}
        />

        <textarea
          placeholder="Description"
          value={description}
          rows={4}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          style={{ color: "var(--color-text-secondary)", fontSize: 13 }}
        />

        <div className="detail-field-row">
          {PRIORITY_ORDER.map((p) => (
            <button
              key={p}
              className="field-pill"
              style={{
                borderColor: task.priority === p ? PRIORITY_META[p].color : undefined,
                color: task.priority === p ? PRIORITY_META[p].color : undefined,
              }}
              onClick={() => setPriority(p)}
            >
              <FlagIcon width={14} height={14} />
              {PRIORITY_META[p].label}
            </button>
          ))}
        </div>

        <div className="detail-field-row">
          <button className="field-pill" onClick={() => setDueOffset(0)}>
            <CalendarIcon width={14} height={14} /> Today
          </button>
          <button className="field-pill" onClick={() => setDueOffset(1)}>
            <CalendarIcon width={14} height={14} /> Tomorrow
          </button>
          <button className="field-pill" onClick={() => setDueOffset(7)}>
            <CalendarIcon width={14} height={14} /> Next week
          </button>
          {task.due && (
            <button className="field-pill" onClick={() => setDueOffset(null)}>
              <XIcon width={14} height={14} /> Clear date
            </button>
          )}
        </div>

        <div className="detail-field-row">
          <label className="field-pill" style={{ gap: 6 }}>
            <CalendarIcon width={14} height={14} />
            <input
              type="date"
              className="detail-date-input"
              value={task.due?.date || ""}
              onChange={(e) => setManualDate(e.target.value)}
            />
          </label>
          <label className="field-pill" style={{ gap: 6, opacity: task.due ? 1 : 0.5 }}>
            time
            <input
              type="time"
              className="detail-date-input"
              value={timeFromDatetime(task.due?.datetime)}
              disabled={!task.due}
              onChange={(e) => setManualTime(e.target.value)}
            />
          </label>
        </div>

        <div className="detail-field-row">
          <select value={task.projectId} onChange={(e) => setProject(e.target.value)}>
            {(data?.projects || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 24 }}>
          <button
            className="btn btn-text"
            style={{ color: "var(--color-accent)" }}
            onClick={() => {
              deleteTask.mutate(task.id);
              onClose();
            }}
          >
            <TrashIcon width={14} height={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
            Delete task
          </button>
        </div>
      </div>
    </div>
  );
}
