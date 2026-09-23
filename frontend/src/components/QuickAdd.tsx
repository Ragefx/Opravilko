import { useEffect, useRef, useState } from "react";
import { useBootstrap, useCreateTask } from "../api/hooks";
import { parseQuickAddInput } from "../utils/quickAddParse";
import { formatDueLabel } from "../utils/date";
import { PRIORITY_META } from "../utils/priority";
import { type RecurrenceFreq, applyRecurrence } from "../utils/recurrence";
import { RepeatIcon } from "./icons";
import SharedToggle from "./SharedToggle";

export default function QuickAdd({
  projectId,
  sectionId = null,
  defaultDue = null,
  defaultShared = false,
}: {
  projectId: string;
  sectionId?: string | null;
  defaultDue?: { date: string; string: string } | null;
  /** New tasks start shared with your partner (the Midva list). */
  defaultShared?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrenceFreq | "none">("none");
  const createTask = useCreateTask();
  const { data } = useBootstrap();
  const [shared, setShared] = useState(defaultShared);
  const partner = data?.partner;
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef(text);
  textRef.current = text;

  // Clicking anywhere else closes the box -- unless something's been typed,
  // so a stray click doesn't throw it away (Cancel or Esc still do).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (boxRef.current?.contains(e.target as Node)) return;
      if (!textRef.current.trim()) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const preview = text.trim() ? parseQuickAddInput(text, defaultDue) : null;
  const previewDue = preview ? applyRecurrence(preview.due, recurrence) : null;

  function submit() {
    if (!text.trim()) return;
    const parsed = parseQuickAddInput(text, defaultDue);
    if (!parsed.content) return;
    // A typed "#Project" sends the task there (and out of this section).
    const typedProject = parsed.projectName
      ? data?.projects.find((p) => p.name.toLowerCase() === parsed.projectName!.toLowerCase())
      : undefined;

    createTask.mutate({
      content: parsed.content,
      projectId: typedProject?.id ?? projectId,
      sectionId: typedProject && typedProject.id !== projectId ? null : sectionId,
      priority: parsed.priority,
      due: applyRecurrence(parsed.due, recurrence),
      labels: parsed.labels,
      sharedWith: partner && (shared || parsed.shared) ? [partner.uid] : undefined,
    });
    setText("");
    setShared(defaultShared);
    setRecurrence("none");
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
    <div className="quick-add" ref={boxRef}>
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
      <div className="quick-add-actions">
        <label className="field-pill" style={{ gap: 6, marginRight: "auto" }}>
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
        {partner && <SharedToggle partner={partner} on={shared || Boolean(preview?.shared)} onChange={setShared} />}
        <button
          className="btn btn-text"
          onClick={() => {
            setOpen(false);
            setText("");
          }}
        >
          Cancel
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={!preview?.content}>
          Add task
        </button>
      </div>
    </div>
  );
}
