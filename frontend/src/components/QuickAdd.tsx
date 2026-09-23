import { useEffect, useRef, useState } from "react";
import { useBootstrap, useCreateTask } from "../api/hooks";
import { parseQuickAddInput } from "../utils/quickAddParse";
import { formatDueLabel } from "../utils/date";
import { PRIORITY_META } from "../utils/priority";
import { type RepeatPreset, applyRecurrence } from "../utils/recurrence";
import RepeatSelect from "./RepeatSelect";
import { RepeatIcon } from "./icons";
import SharedToggle from "./SharedToggle";
import DueButton from "./DueButton";
import type { Due } from "../api/types";

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
  const [recurrence, setRecurrence] = useState<RepeatPreset | "none">("none");
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
      // The date picker opened from this box is outside it, but part of it.
      if ((e.target as Element).closest?.(".date-picker-panel, .dropdown-backdrop.over-modal, .time-picker-panel")) return;
      if (!textRef.current.trim()) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // A date picked with the Date button wins over one typed in the text.
  const [picked, setPicked] = useState<Due | null | undefined>(undefined);
  const preview = text.trim() ? parseQuickAddInput(text, defaultDue) : null;
  const baseDue: Due | null =
    picked !== undefined ? picked : preview ? preview.due : defaultDue ? { ...defaultDue, isRecurring: false } : null;
  const previewDue = preview ? applyRecurrence(baseDue, recurrence) : null;

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
      due: applyRecurrence(picked !== undefined ? picked : parsed.due, recurrence),
      labels: parsed.labels,
      sharedWith: partner && (shared || parsed.shared) ? [partner.uid] : undefined,
    });
    setText("");
    setShared(defaultShared);
    setRecurrence("none");
    setPicked(undefined);
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
          <RepeatSelect value={recurrence} onChange={setRecurrence} />
        </label>
        <DueButton shown={baseDue} picked={picked} onPick={setPicked} />
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
