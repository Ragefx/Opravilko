import { useState } from "react";
import { useBootstrap, useCreateTask } from "../api/hooks";
import { parseQuickAddInput } from "../utils/quickAddParse";
import { formatDueLabel } from "../utils/date";
import { PRIORITY_META } from "../utils/priority";
import { useToast } from "./ToastProvider";

/** App-wide "add task from anywhere" box, opened with `q`. */
export default function QuickAddModal({ onClose }: { onClose: () => void }) {
  const { data } = useBootstrap();
  const createTask = useCreateTask();
  const showToast = useToast();
  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState("inbox");

  const projects = data?.projects || [];
  const preview = text.trim() ? parseQuickAddInput(text) : null;

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
        due: preview.due,
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

        <div className="modal-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <select
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
