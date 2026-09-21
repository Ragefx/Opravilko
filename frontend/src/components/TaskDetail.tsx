import { useEffect, useRef, useState } from "react";
import type { Task } from "../api/types";
import {
  useAddComment,
  useBootstrap,
  useCompleteTask,
  useCreateTask,
  useDeleteComment,
  useDeleteTask,
  useRestoreTasks,
  useUpdateTask,
} from "../api/hooks";
import { PRIORITY_META, PRIORITY_ORDER } from "../utils/priority";
import { makeDue, makeDueFromDateString } from "../utils/date";
import {
  type RecurrenceFreq,
  parseRecurrenceString,
  serializeRecurrence,
} from "../utils/recurrence";
import { CopyIcon, FlagIcon, CalendarIcon, RepeatIcon, TrashIcon, XIcon } from "./icons";
import { useToast } from "./ToastProvider";
import TaskCheckbox from "./TaskCheckbox";

function timeFromDatetime(datetime?: string): string {
  if (!datetime) return "";
  const d = new Date(datetime);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Native <input type="time"> follows the OS/browser locale for 12h/24h display
// no matter what `lang` is set to on some browsers, so the time field is built
// from two plain <select>s instead -- always shows and stores 00:00-23:59.
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

export default function TaskDetail({
  task: initialTask,
  onClose,
  onOpenTask,
}: {
  task: Task;
  onClose: () => void;
  onOpenTask?: (task: Task) => void;
}) {
  const { data } = useBootstrap();
  // The task prop is a snapshot from whichever list opened this panel. Once a
  // mutation updates the bootstrap cache, re-derive from it so field pills
  // (priority, due date, ...) reflect the change immediately instead of
  // waiting for the panel to be closed and reopened.
  const task = data?.tasks.find((t) => t.id === initialTask.id) ?? initialTask;
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const restoreTasks = useRestoreTasks();
  const createTask = useCreateTask();
  const completeTask = useCompleteTask();
  const addComment = useAddComment();
  const deleteComment = useDeleteComment();
  const showToast = useToast();
  const [content, setContent] = useState(task.content);
  const [description, setDescription] = useState(task.description);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskText, setSubtaskText] = useState("");
  const [commentText, setCommentText] = useState("");
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setContent(task.content);
    setDescription(task.description);
  }, [task.id]);

  // Grows the description box to fit its content -- on open and as it's
  // typed into -- instead of a fixed row count that clips longer text.
  useEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [description]);

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

  function setRecurrence(freq: RecurrenceFreq | "none") {
    if (!task.due) return;
    if (freq === "none") {
      updateTask.mutate({ id: task.id, due: { ...task.due, isRecurring: false, rrule: undefined } });
      return;
    }
    updateTask.mutate({
      id: task.id,
      due: { ...task.due, isRecurring: true, rrule: serializeRecurrence({ freq }) },
    });
  }

  const currentFreq = parseRecurrenceString(task.due?.rrule)?.freq;
  const [timeHour, timeMinute] = timeFromDatetime(task.due?.datetime).split(":");
  const parentTask = task.parentId ? data?.tasks.find((t) => t.id === task.parentId) : undefined;
  const subtasks = (data?.tasks || [])
    .filter((t) => t.parentId === task.id)
    .sort((a, b) => a.order - b.order);

  function addSubtask() {
    const value = subtaskText.trim();
    if (!value) return;
    createTask.mutate({
      content: value,
      projectId: task.projectId,
      sectionId: task.sectionId,
      parentId: task.id,
    });
    setSubtaskText("");
    setAddingSubtask(false);
  }

  function submitComment() {
    const value = commentText.trim();
    if (!value) return;
    addComment.mutate({ taskId: task.id, text: value });
    setCommentText("");
  }

  function duplicateTask() {
    createTask.mutate(
      {
        content: task.content,
        description: task.description,
        projectId: task.projectId,
        sectionId: task.sectionId,
        parentId: task.parentId,
        priority: task.priority,
        due: task.due,
        labels: task.labels,
      },
      {
        onSuccess: (created) => {
          showToast({ message: "Task duplicated" });
          onOpenTask?.(created);
        },
      }
    );
  }

  function handleDelete() {
    deleteTask.mutate(task.id, {
      onSuccess: (removed) => {
        showToast({
          message: `"${task.content}" deleted`,
          actionLabel: "Undo",
          onAction: () => restoreTasks.mutate(removed),
        });
      },
    });
    onClose();
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button className="btn-text" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        {parentTask && (
          <button
            className="btn-text"
            style={{ padding: "2px 0 8px", fontSize: 12, display: "block" }}
            onClick={() => onOpenTask?.(parentTask)}
          >
            ↰ {parentTask.content}
          </button>
        )}

        <textarea
          className="detail-title"
          value={content}
          rows={2}
          onChange={(e) => setContent(e.target.value)}
          onBlur={saveContent}
        />

        <textarea
          ref={descriptionRef}
          placeholder="Description"
          value={description}
          rows={1}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          style={{
            color: "var(--color-text-secondary)",
            fontSize: 13,
            minHeight: 64,
            overflow: "hidden",
          }}
        />

        <div className="detail-field-row">
          {PRIORITY_ORDER.map((p) => (
            <button
              key={p}
              className="field-pill"
              style={
                task.priority === p
                  ? {
                      background: PRIORITY_META[p].color,
                      borderColor: PRIORITY_META[p].color,
                      color: "#fff",
                      fontWeight: 600,
                    }
                  : undefined
              }
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
          <label className="field-pill" style={{ gap: 4, opacity: task.due ? 1 : 0.5 }}>
            time
            <select
              className="detail-date-input"
              value={timeHour || ""}
              disabled={!task.due}
              onChange={(e) => setManualTime(`${e.target.value}:${timeMinute || "00"}`)}
            >
              {!timeHour && <option value="" />}
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            :
            <select
              className="detail-date-input"
              value={timeMinute || ""}
              disabled={!task.due}
              onChange={(e) => setManualTime(`${timeHour || "00"}:${e.target.value}`)}
            >
              {!timeMinute && <option value="" />}
              {MINUTES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>

        {task.due && (
          <div className="detail-field-row">
            <label className="field-pill" style={{ gap: 6 }}>
              <RepeatIcon width={14} height={14} />
              <select
                className="detail-date-input"
                value={currentFreq || "none"}
                onChange={(e) => setRecurrence(e.target.value as RecurrenceFreq | "none")}
              >
                <option value="none">Doesn't repeat</option>
                <option value="daily">Every day</option>
                <option value="weekdays">Every weekday</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
              </select>
            </label>
          </div>
        )}

        <div className="detail-field-row">
          <select value={task.projectId} onChange={(e) => setProject(e.target.value)}>
            {(data?.projects || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 20 }}>
          <div className="task-section-title" style={{ margin: "0 0 8px" }}>
            Sub-tasks{subtasks.length > 0 ? ` (${subtasks.filter((s) => s.completed).length}/${subtasks.length})` : ""}
          </div>
          {subtasks.map((s) => (
            <div key={s.id} className="task-row" style={{ padding: "4px 0" }}>
              <TaskCheckbox
                completed={s.completed}
                priorityColor={PRIORITY_META[s.priority].color}
                recurring={!!s.due?.isRecurring}
                onToggle={(next) => completeTask.mutate({ id: s.id, completed: next })}
              />
              <div
                className={`task-content ${s.completed ? "completed" : ""}`}
                style={{ fontSize: 13 }}
                onClick={() => onOpenTask?.(s)}
              >
                {s.content}
              </div>
            </div>
          ))}

          {addingSubtask ? (
            <div className="quick-add" style={{ marginTop: 4 }}>
              <input
                autoFocus
                placeholder="Sub-task name"
                value={subtaskText}
                onChange={(e) => setSubtaskText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addSubtask();
                  if (e.key === "Escape") setAddingSubtask(false);
                }}
              />
              <div className="quick-add-actions">
                <button className="btn btn-text" onClick={() => setAddingSubtask(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={addSubtask} disabled={!subtaskText.trim()}>
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button className="add-task-trigger" onClick={() => setAddingSubtask(true)}>
              <span className="plus">+</span> Add sub-task
            </button>
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <div className="task-section-title" style={{ margin: "0 0 8px" }}>
            Comments{task.comments?.length ? ` (${task.comments.length})` : ""}
          </div>
          {(task.comments || []).map((c) => (
            <div key={c.id} className="comment-row">
              <div className="comment-text">{c.text}</div>
              <div className="comment-meta">
                <span>{new Date(c.createdAt).toLocaleString()}</span>
                <button
                  className="btn-text"
                  style={{ padding: "0 0 0 8px", fontSize: 12 }}
                  onClick={() => deleteComment.mutate({ taskId: task.id, commentId: c.id })}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          <div className="quick-add" style={{ marginTop: 4 }}>
            <input
              placeholder="Add a comment"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitComment()}
            />
            <div className="quick-add-actions">
              <button className="btn btn-primary" onClick={submitComment} disabled={!commentText.trim()}>
                Comment
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20, display: "flex", gap: 4 }}>
          <button className="btn btn-text" onClick={duplicateTask}>
            <CopyIcon width={14} height={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
            Duplicate
          </button>
          <button className="btn btn-text" style={{ color: "var(--color-danger)" }} onClick={handleDelete}>
            <TrashIcon width={14} height={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
            Delete task
          </button>
        </div>
      </div>
    </div>
  );
}
