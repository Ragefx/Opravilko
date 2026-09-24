import { type ReactNode, forwardRef, useEffect, useRef, useState } from "react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import type { Task } from "../api/types";
import {
  useAddComment,
  useBootstrap,
  useCompleteTask,
  useCreateTask,
  useDeleteComment,
  useDeleteTask,
  useRestoreTasks,
  useSetTaskShared,
  useUpdateTask,
} from "../api/hooks";
import { PRIORITY_META, PRIORITY_ORDER } from "../utils/priority";
import { makeDue } from "../utils/date";
import {
  type RepeatPreset,
  describeRecurrence,
  dueWithPreset,
  parseRecurrenceString,
  presetForRule,
} from "../utils/recurrence";
import RepeatSelect from "./RepeatSelect";
import {
  BellIcon,
  CalendarIcon,
  ChevronIcon,
  CopyIcon,
  FlagIcon,
  InboxIcon,
  MapPinIcon,
  RepeatIcon,
  ShareIcon,
  TagIcon,
  TrashIcon,
  XIcon,
} from "./icons";
import { appUi } from "../utils/appUi";
import { addTargets } from "../utils/addTargets";
import DatePickerPopup from "./DatePickerPopup";
import LocationPicker from "./LocationPicker";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  arrivalRemindersAvailable,
  myArrivalId,
  openLocationSettings,
  remindsMe,
  requestArrivalAccess,
} from "../native/places";
import { mapsUrl } from "../utils/places";
import { useToast } from "./ToastProvider";
import TaskCheckbox from "./TaskCheckbox";
import RichTextEditor from "./RichTextEditor";
import RowMenu from "./RowMenu";
import TaskAttachments from "./TaskAttachments";

const REMINDER_OPTIONS: [number, string][] = [
  [0, "Remind at due time"],
  [5, "5 min before"],
  [15, "15 min before"],
  [30, "30 min before"],
  [60, "1 hour before"],
  [120, "2 hours before"],
  [1440, "1 day before"],
];

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
  const setShared = useSetTaskShared();
  const deleteTask = useDeleteTask();
  const restoreTasks = useRestoreTasks();
  const createTask = useCreateTask();
  const completeTask = useCompleteTask();
  const addComment = useAddComment();
  const deleteComment = useDeleteComment();
  const showToast = useToast();
  const [content, setContent] = useState(task.content);
  const [description, setDescription] = useState(task.description);
  const [pickingLocation, setPickingLocation] = useState(false);

  /** Android app: arrival reminder on/off for me; asks for location access when turning it on. */
  async function toggleArrival(on: boolean) {
    if (!task.location) return;
    const me = myArrivalId();
    const others = (task.location.arrivalFor ?? []).filter((id) => id !== me);
    // Built without the key when nobody's left (the database refuses empty values).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { arrivalFor: _old, ...place } = task.location;
    const next = on ? [...others, me] : others;
    updateTask.mutate({ id: task.id, location: next.length ? { ...place, arrivalFor: next } : place });
    if (!on) return;
    await LocalNotifications.requestPermissions().catch(() => {});
    const access = await requestArrivalAccess();
    if (!access.location) {
      showToast({ message: "Arrival reminders need location access for Opravilko." });
    } else if (!access.background) {
      showToast({
        message: "To remind you with the app closed, set Opravilko's location to “Allow all the time”.",
        actionLabel: "Settings",
        onAction: openLocationSettings,
      });
    }
  }
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskText, setSubtaskText] = useState("");
  const [commentText, setCommentText] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [pickingDate, setPickingDate] = useState(false);
  const dateRow = useRef<HTMLButtonElement>(null);
  const [dateAnchor, setDateAnchor] = useState<{ top: number; right: number } | null>(null);

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




  function setRecurrence(preset: RepeatPreset | "none") {
    if (!task.due) return;
    if (preset === "none") {
      updateTask.mutate({ id: task.id, due: { ...task.due, isRecurring: false, rrule: undefined } });
      return;
    }
    updateTask.mutate({ id: task.id, due: dueWithPreset({ ...task.due, isRecurring: false }, preset) });
  }

  function addLabel() {
    const value = labelInput.trim();
    if (!value || task.labels.includes(value)) {
      setLabelInput("");
      return;
    }
    updateTask.mutate({ id: task.id, labels: [...task.labels, value] });
    setLabelInput("");
  }

  function removeLabel(name: string) {
    updateTask.mutate({ id: task.id, labels: task.labels.filter((l) => l !== name) });
  }

  const currentRule = task.due?.isRecurring ? parseRecurrenceString(task.due.rrule) : null;
  const currentRepeat = currentRule ? presetForRule(currentRule) ?? "custom" : "none";
  const parentTask = task.parentId ? data?.tasks.find((t) => t.id === task.parentId) : undefined;
  const subtasks = (data?.tasks || [])
    .filter((t) => t.parentId === task.id)
    .sort((a, b) => a.order - b.order);
  const project = data?.projects.find((p) => p.id === task.projectId);
  const existingLabelNames = (data?.labels || []).map((l) => l.name).filter((n) => !task.labels.includes(n));

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

  const subtasksBlock = (
    <div style={{ marginTop: 20 }}>
      <div className="task-section-title" style={{ margin: "0 0 8px" }}>
        Sub-tasks
        {subtasks.length > 0
          ? ` (${subtasks.filter((s) => s.completed).length}/${subtasks.length})`
          : ""}
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
  );
  const commentsBlock = (
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
  );

  /**
   * The task view: the name and notes, one row per property (icon, what it
   * is, its value; tap the row to change it), then sub-tasks, attachments and
   * comments. Full screen below the status bar in the Android app; a window
   * with the properties in a side panel on the website.
   */
  function renderView() {
    const section = task.sectionId ? data?.sections.find((s) => s.id === task.sectionId) : undefined;
    const where = project ? (section ? `${project.name} / ${section.name}` : project.name) : "";
    const targets = addTargets(data);
    const hereKey = `${task.projectId}:${task.sectionId ?? ""}`;
    const places = targets.some((t) => t.key === hereKey)
      ? targets
      : [{ key: hereKey, projectId: task.projectId, sectionId: task.sectionId ?? null, label: where }, ...targets];
    const due = task.due;
    const dueDay = due ? parseISO(due.date) : null;
    const dueText = dueDay
      ? `${isToday(dueDay) ? "Today" : isTomorrow(dueDay) ? "Tomorrow" : format(dueDay, "EEE, d MMM yyyy")}${
          due?.datetime ? ` · ${format(new Date(due.datetime), "HH:mm")}` : ""
        }`
      : "";
    const overdue = due ? due.date < format(new Date(), "yyyy-MM-dd") : false;
    const priorityColor = task.priority !== 1 ? PRIORITY_META[task.priority].color : undefined;
    const first = data?.partner?.name.split(" ")[0] ?? "";
    const shared = Boolean(task.sharedWith?.length);

    function openDate() {
      const r = dateRow.current?.getBoundingClientRect();
      setDateAnchor({
        top: Math.max(8, Math.min((r?.bottom ?? 200) + 4, window.innerHeight - 540)),
        right: appUi ? 12 : Math.max(8, window.innerWidth - (r?.right ?? window.innerWidth - 12)),
      });
      setPickingDate(true);
    }

    return (
      <div className={`overlay ${appUi ? "td-overlay" : "td-web-overlay"}`} onClick={onClose}>
        <div
          className={`detail-panel ${appUi ? "td-app" : "td-web"}`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label={task.content}
        >
          <div className="td-head">
            {appUi && (
              <button className="td-head-btn" onClick={onClose} aria-label="Close">
                <XIcon width={22} height={22} />
              </button>
            )}
            <div className="td-head-where">
              {parentTask ? (
                <button onClick={() => onOpenTask?.(parentTask)}>↰ {parentTask.content}</button>
              ) : (
                where || `Midva · from ${task.sharedBy?.name.split(" ")[0] || "your partner"}`
              )}
            </div>
            <RowMenu
              label="Task"
              items={[
                { label: "Duplicate", icon: <CopyIcon width={16} height={16} />, onClick: duplicateTask },
                { label: "Delete task", icon: <TrashIcon width={16} height={16} />, danger: true, onClick: handleDelete },
              ]}
            />
            {!appUi && (
              <button className="td-head-btn" onClick={onClose} aria-label="Close">
                <XIcon width={20} height={20} />
              </button>
            )}
          </div>

          {/* The name and notes, the properties, then sub-tasks, attachments and
              comments: one column in the app (and narrow windows); on a wide
              screen the properties sit in a panel on the right. */}
          <div className="td-scroll">
           <div className="td-cols">
            <div className="td-top">
            <div className="td-title-row">
              <TaskCheckbox
                completed={task.completed}
                priorityColor={PRIORITY_META[task.priority].color}
                recurring={!!task.due?.isRecurring}
                onToggle={(next) => completeTask.mutate({ id: task.id, completed: next })}
              />
              <textarea
                className="td-title"
                value={content}
                rows={1}
                ref={(el) => {
                  if (el) {
                    el.style.height = "auto";
                    el.style.height = `${el.scrollHeight}px`;
                  }
                }}
                onChange={(e) => setContent(e.target.value)}
                onBlur={saveContent}
              />
            </div>
            <div className="td-desc">
              <RichTextEditor html={description} onChange={setDescription} onBlur={saveDescription} />
            </div>
            </div>

            <aside className="td-side">
            <div className="td-props">
              <PropRow
                icon={project?.isInboxProject ? <InboxIcon width={20} height={20} /> : <span className="td-hash">#</span>}
                caption="Project"
                value={where || `Midva · from ${task.sharedBy?.name.split(" ")[0] || "your partner"}`}
                chevron={Boolean(project)}
              >
                {project && (
                  <select
                    className="td-cover"
                    value={hereKey}
                    aria-label="Move to"
                    onChange={(e) => {
                      const t = places.find((x) => x.key === e.target.value);
                      if (t) updateTask.mutate({ id: task.id, projectId: t.projectId, sectionId: t.sectionId });
                    }}
                  >
                    {places.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                )}
              </PropRow>

              <PropRow
                ref={dateRow}
                icon={<CalendarIcon width={20} height={20} />}
                caption="Date"
                value={dueText || "No date"}
                muted={!due}
                color={due ? (overdue ? "var(--color-danger)" : "var(--color-accent)") : undefined}
                onClick={openDate}
                trailing={
                  due ? (
                    <button
                      className="td-clear"
                      aria-label="Clear date"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDueOffset(null);
                      }}
                    >
                      <XIcon width={16} height={16} />
                    </button>
                  ) : undefined
                }
              />

              {due && (
                <PropRow
                  icon={<RepeatIcon width={20} height={20} />}
                  caption="Repeat"
                  value={currentRepeat === "none" ? "Doesn't repeat" : describeRecurrence(currentRule) || "Custom"}
                  muted={currentRepeat === "none"}
                  chevron
                >
                  <span className="td-cover">
                    <RepeatSelect value={currentRepeat} onChange={setRecurrence} customLabel={describeRecurrence(currentRule)} />
                  </span>
                </PropRow>
              )}

              {due?.datetime && (
                <PropRow
                  icon={<BellIcon width={20} height={20} />}
                  caption="Reminder"
                  value={REMINDER_OPTIONS.find(([m]) => m === (task.reminderMinutes ?? 0))?.[1] ?? "Remind at due time"}
                  chevron
                >
                  <select
                    className="td-cover"
                    value={task.reminderMinutes ?? 0}
                    aria-label="Reminder"
                    onChange={(e) => updateTask.mutate({ id: task.id, reminderMinutes: Number(e.target.value) })}
                  >
                    {REMINDER_OPTIONS.map(([minutes, label]) => (
                      <option key={minutes} value={minutes}>
                        {label}
                      </option>
                    ))}
                  </select>
                </PropRow>
              )}

              <PropRow
                icon={<FlagIcon width={20} height={20} />}
                caption="Priority"
                value={PRIORITY_META[task.priority].label}
                color={priorityColor}
                muted={!priorityColor}
                chevron
              >
                <select
                  className="td-cover"
                  value={task.priority}
                  aria-label="Priority"
                  onChange={(e) => setPriority(Number(e.target.value) as (typeof PRIORITY_ORDER)[number])}
                >
                  {PRIORITY_ORDER.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_META[p].label}
                    </option>
                  ))}
                </select>
              </PropRow>

              <div className="td-row td-row-labels">
                <span className="td-row-icon">
                  <TagIcon width={20} height={20} />
                </span>
                <div className="td-row-body">
                  <span className="td-row-caption">Labels</span>
                  <div className="td-label-chips">
                    {task.labels.map((l) => (
                      <span key={l} className="td-label-chip">
                        @{l}
                        <button onClick={() => removeLabel(l)} aria-label={`Remove label ${l}`}>
                          <XIcon width={12} height={12} />
                        </button>
                      </span>
                    ))}
                    <input
                      className="td-label-input"
                      list="task-detail-existing-labels"
                      placeholder={task.labels.length ? "Add" : "Add a label"}
                      value={labelInput}
                      enterKeyHint="done"
                      onChange={(e) => setLabelInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addLabel()}
                      onBlur={addLabel}
                    />
                    <datalist id="task-detail-existing-labels">
                      {existingLabelNames.map((n) => (
                        <option key={n} value={n} />
                      ))}
                    </datalist>
                  </div>
                </div>
              </div>

              <PropRow
                icon={<MapPinIcon width={20} height={20} />}
                caption="Location"
                value={task.location ? task.location.name : "Add a location"}
                sub={task.location?.address}
                muted={!task.location}
                onClick={() => setPickingLocation(true)}
                trailing={
                  task.location ? (
                    <a
                      className="td-clear td-maps"
                      href={mapsUrl(task.location)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Map
                    </a>
                  ) : undefined
                }
              />
              {task.location && arrivalRemindersAvailable && (
                <label className="td-row td-row-switch">
                  <span className="td-row-icon" />
                  <span className="td-row-body">
                    <span className="td-row-value">Remind me when I arrive</span>
                  </span>
                  <input
                    type="checkbox"
                    className="td-switch"
                    checked={remindsMe(task)}
                    onChange={(e) => void toggleArrival(e.target.checked)}
                  />
                </label>
              )}

              {project && data?.partner && (
                <label className="td-row td-row-switch">
                  <span className="td-row-icon">
                    <ShareIcon width={20} height={20} />
                  </span>
                  <span className="td-row-body">
                    <span className="td-row-caption">Midva</span>
                    <span className="td-row-value">{shared ? `Shared with ${first}` : `Share with ${first}`}</span>
                  </span>
                  <input
                    type="checkbox"
                    className="td-switch"
                    checked={shared}
                    onChange={(e) => setShared.mutate({ id: task.id, shared: e.target.checked })}
                  />
                </label>
              )}
            </div>

            </aside>

            <div className="td-bottom">
            <div className="td-section">{subtasksBlock}</div>
            <div className="td-section">
              <TaskAttachments task={task} />
            </div>
            <div className="td-section">{commentsBlock}</div>
            </div>
           </div>
          </div>
        </div>

        {pickingDate && dateAnchor && (
          <div onClick={(e) => e.stopPropagation()}>
            <DatePickerPopup taskId={task.id} anchor={dateAnchor} onClose={() => setPickingDate(false)} />
          </div>
        )}
        {pickingLocation && (
          <div onClick={(e) => e.stopPropagation()}>
            <LocationPicker
              initial={task.location}
              onClose={() => setPickingLocation(false)}
              onSave={(loc) => {
                updateTask.mutate({ id: task.id, location: loc ?? undefined });
                setPickingLocation(false);
              }}
            />
          </div>
        )}
      </div>
    );
  }

  return renderView();
}

/** One property of the task in the task view: icon, what it is, its value. */
const PropRow = forwardRef<
  HTMLButtonElement,
  {
    icon: ReactNode;
    caption: string;
    value: string;
    sub?: string;
    muted?: boolean;
    color?: string;
    chevron?: boolean;
    onClick?: () => void;
    trailing?: ReactNode;
    children?: ReactNode;
  }
>(function PropRow({ icon, caption, value, sub, muted, color, chevron, onClick, trailing, children }, ref) {
  const body = (
    <>
      <span className="td-row-icon" style={color ? { color } : undefined}>
        {icon}
      </span>
      <span className="td-row-body">
        <span className="td-row-caption">{caption}</span>
        <span className={`td-row-value ${muted ? "is-muted" : ""}`} style={color ? { color } : undefined}>
          {value}
        </span>
        {sub && <span className="td-row-sub">{sub}</span>}
      </span>
      {chevron && <ChevronIcon width={18} height={18} className="td-row-chevron" />}
    </>
  );
  // A tap target of its own, or a row that a native <select> (children) covers.
  return onClick ? (
    <div className="td-row">
      <button ref={ref} type="button" className="td-row-tap" onClick={onClick}>
        {body}
      </button>
      {trailing}
    </div>
  ) : (
    <div className="td-row">
      {body}
      {children}
      {trailing}
    </div>
  );
});
