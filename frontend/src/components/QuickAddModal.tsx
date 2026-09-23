import { useState } from "react";
import { format, parseISO } from "date-fns";
import { useBootstrap, useCreateTask } from "../api/hooks";
import { parseQuickAddInput } from "../utils/quickAddParse";
import { formatDueLabel, todayISO } from "../utils/date";
import { PRIORITY_META } from "../utils/priority";
import { type RepeatPreset, applyRecurrence } from "../utils/recurrence";
import RepeatSelect from "./RepeatSelect";
import DueButton from "./DueButton";
import type { Due } from "../api/types";
import { RepeatIcon } from "./icons";
import SharedToggle from "./SharedToggle";
import { useToast } from "./ToastProvider";

/** App-wide "add task from anywhere" box, opened with `q`. */
export default function QuickAddModal({
  onClose,
  defaultProjectId = "inbox",
  defaultToday = false,
  defaultDate,
}: {
  onClose: () => void;
  /** The project being viewed, so "add task" from there lands in it. */
  defaultProjectId?: string;
  /** Due today unless a date is typed (the Android widget's Today list). */
  defaultToday?: boolean;
  /** Due on this "yyyy-MM-dd" day unless a date is typed (a day clicked in the calendar). */
  defaultDate?: string;
}) {
  const { data } = useBootstrap();
  const createTask = useCreateTask();
  const showToast = useToast();
  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [recurrence, setRecurrence] = useState<RepeatPreset | "none">("none");
  const [shared, setShared] = useState(false);
  const partner = data?.partner;

  const projects = data?.projects || [];
  const [defaultDue] = useState(() =>
    defaultDate
      ? { date: defaultDate, string: format(parseISO(defaultDate), "MMM d") }
      : defaultToday
        ? { date: todayISO(), string: "today" }
        : null
  );
  // A date picked with the Date button wins over one typed in the text.
  const [picked, setPicked] = useState<Due | null | undefined>(undefined);
  const preview = text.trim() ? parseQuickAddInput(text, defaultDue) : null;
  const baseDue: Due | null =
    picked !== undefined ? picked : preview ? preview.due : defaultDue ? { ...defaultDue, isRecurring: false } : null;
  const previewDue = preview ? applyRecurrence(baseDue, recurrence) : null;

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
        due: applyRecurrence(baseDue, recurrence),
        labels: preview.labels,
        sharedWith: partner && (shared || preview.shared) ? [partner.uid] : undefined,
      },
      {
        onSuccess: () =>
          showToast({
            message: `Added to ${targetProject?.name || "Inbox"}${partner && (shared || preview.shared) ? `, shared with ${partner.name.split(" ")[0]}` : ""}`,
          }),
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
              style={{ flex: "1 1 140px", minWidth: 120 }}
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
            <DueButton shown={baseDue} picked={picked} onPick={setPicked} />
            {partner && <SharedToggle partner={partner} on={shared || Boolean(preview?.shared)} onChange={setShared} />}
            <label className="field-pill" style={{ gap: 6, flexShrink: 0 }}>
              <RepeatIcon width={14} height={14} />
              <RepeatSelect value={recurrence} onChange={setRecurrence} />
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
