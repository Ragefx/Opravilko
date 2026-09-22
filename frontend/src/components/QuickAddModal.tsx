import { useState } from "react";
import { useBootstrap, useCreateTask } from "../api/hooks";
import { parseQuickAddInput } from "../utils/quickAddParse";
import { formatDueLabel } from "../utils/date";
import { PRIORITY_META } from "../utils/priority";
import { type RecurrenceFreq, applyRecurrence } from "../utils/recurrence";
import { RepeatIcon } from "./icons";
import { useToast } from "./ToastProvider";

/** App-wide "add task from anywhere" box, opened with `q`. */
export default function QuickAddModal({
  onClose,
  defaultProjectId = "inbox",
}: {
  onClose: () => void;
  /** The project being viewed, so "add task" from there lands in it. */
  defaultProjectId?: string;
}) {
  const { data } = useBootstrap();
  const createTask = useCreateTask();
  const showToast = useToast();
  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [recurrence, setRecurrence] = useState<RecurrenceFreq | "none">("none");

  const projects = data?.projects || [];
  const preview = text.trim() ? parseQuickAddInput(text) : null;
  const previewDue = preview ? applyRecurrence(preview.due, recurrence) : null;

  // A typed "#ProjectName" wins over the dropdown, matching Todoist.
  const typedProject = preview?.projectName
    ? projects.find((p) => p.name.toLowerCase() === preview.projectName!.toLowerCase())
    : undefined;
  const targetProject = typedProject || projects.find((p) => p.id === projectId);

  function submit() {
    if (!preview?.content) return;
    createTask.mutate(
      {
        content: preview.content,
        projectId: targetProject?.id || "inbox",
        priority: preview.priority,
        due: applyRecurrence(preview.due, recurrence),
        labels: preview.labels,
      },
      {
        onSuccess: () => showToast({ message: `Added to ${targetProject?.name || "Inbox"}` }),
      }
    );
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal quick-add-modal" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          type="text"
          placeholder="Task name — try “report friday p1 @work #Marketing”"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onClose();
          }}
        />

        {preview && (previewDue || preview.labels.length > 0 || preview.priority !== 1) && (
          <div className="quick-add-preview">
            {previewDue && (
              <span className="chip">
                {formatDueLabel(previewDue)}
                {previewDue.isRecurring && (
                  <RepeatIcon width={11} height={11} style={{ verticalAlign: "-1px" }} />
                )}
              </span>
            )}
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

        <div className="modal-actions quick-add-modal-actions">
          <div className="quick-add-modal-options">
            <select
              style={{ flex: "1 1 auto", minWidth: 0 }}
              value={typedProject?.id ?? projectId}
              disabled={Boolean(typedProject)}
              onChange={(e) => setProjectId(e.target.value)}
              title={typedProject ? "Set by the #project you typed" : "Choose a project"}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <label className="field-pill" style={{ gap: 6, flexShrink: 0 }}>
              <RepeatIcon width={14} height={14} />
              <select
                className="detail-date-input"
                value={recurrence}
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
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-text" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={!preview?.content}>
              Add task
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
