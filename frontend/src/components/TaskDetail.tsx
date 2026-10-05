import { type ReactNode, forwardRef, useEffect, useRef, useState } from "react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import type { Partner, Project, Task } from "../api/types";
import {
  useAddComment,
  useBootstrap,
  useCompleteTask,
  useCreateProject,
  useCreateTask,
  useDeleteComment,
  useEditComment,
  useDeleteTask,
  useRestoreTasks,
  useSetTaskShared,
  useUpdateProject,
  useUpdateTask,
} from "../api/hooks";
import { useNavigate } from "react-router-dom";
import { projectRoute } from "../utils/away";
import { PRIORITY_META, PRIORITY_ORDER } from "../utils/priority";
import { commentAuthor, completedByName } from "../utils/completedBy";
import { currentUser } from "../firebase/auth";
import { linkParts } from "../utils/linkify";
import { deadlineInfo } from "../utils/deadline";
import { parseQuickAddInput } from "../utils/quickAddParse";
import { dueDateClass, formatDueLabel, makeDue, todayISO } from "../utils/date";
import {
  type RecurrenceRule,
  type RepeatPreset,
  describeRecurrence,
  dueWithPreset,
  nextOccurrence,
  parseRecurrenceString,
  presetForRule,
  serializeRecurrence,
} from "../utils/recurrence";
import RepeatSelect from "./RepeatSelect";
import {
  BellIcon,
  CalendarIcon,
  ChevronIcon,
  CopyIcon,
  FlagIcon,
  HourglassIcon,
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
import TimePickerPopup from "./TimePickerPopup";
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
import { useCompleteAnimation } from "./useCompleteAnimation";
import RichTextEditor from "./RichTextEditor";
import RowMenu from "./RowMenu";
import TaskAttachments from "./TaskAttachments";
import Select from "./Select";
import ReminderSheet from "./ReminderSheet";
import { describeReminder, remindersOf } from "../utils/reminders";
import { labelTint, useLabelColor } from "./LabelChip";
import { isEvent } from "../utils/events";
import { useHidden } from "../utils/simple";

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
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const navigate = useNavigate();
  const completeTask = useCompleteTask();
  const addComment = useAddComment();
  const deleteComment = useDeleteComment();
  const editComment = useEditComment();
  const [editingComment, setEditingComment] = useState<{ id: string; text: string } | null>(null);
  const user = currentUser();
  const me = user ? { name: user.displayName, photo: user.photoURL } : null;
  const showToast = useToast();
  // Ticking it off here plays the list's tick (circle pops, name strikes
  // through), then the task closes, with Undo.
  const tick = useCompleteAnimation();
  function tickOff() {
    const id = task.id;
    const repeats = !!task.due?.isRecurring;
    tick.play(
      () => {
        completeTask.mutate({ id, completed: true });
        onClose();
        showToast(
          repeats
            ? { message: `✓ ${task.content} · next time moved on` }
            : { message: `✓ ${task.content}`, actionLabel: "Undo", onAction: () => completeTask.mutate({ id, completed: false }) }
        );
      },
      { fold: false }
    );
  }
  const [content, setContent] = useState(task.content);
  const [description, setDescription] = useState(task.description);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [pickingEnd, setPickingEnd] = useState(false);
  const endRow = useRef<HTMLButtonElement>(null);

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
  const [pickingDeadline, setPickingDeadline] = useState(false);
  const deadlineRow = useRef<HTMLButtonElement>(null);
  const hideDeadline = useHidden("deadline");
  const hideLabels = useHidden("labels");
  const hideLocation = useHidden("location");
  const hideMidvaFrom = useHidden("midvaFrom");
  const [pickingReminders, setPickingReminders] = useState(false);
  const taskReminders = remindersOf(task);
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
    // Switching between repeats keeps "count from when it's done".
    const afterDone = Boolean(parseRecurrenceString(task.due.rrule)?.afterDone);
    updateTask.mutate({ id: task.id, due: dueWithPreset({ ...task.due, isRecurring: false }, preset, afterDone) });
  }

  /** "Count from when it's done" on or off for a repeating task. */
  function setAfterDone(on: boolean) {
    const rule = task.due?.isRecurring ? parseRecurrenceString(task.due.rrule) : null;
    if (!task.due || !rule) return;
    const next: RecurrenceRule = { ...rule };
    if (on) next.afterDone = true;
    else delete next.afterDone;
    updateTask.mutate({
      id: task.id,
      due: { ...task.due, rrule: serializeRecurrence(next), string: describeRecurrence(next) },
    });
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
  const labelColor = useLabelColor();

  function addSubtask() {
    const value = subtaskText.trim();
    if (!value) return;
    // A date, priority or deadline typed in the name counts, as in Add task ("Foto jutri ob 10").
    const parsed = parseQuickAddInput(value);
    createTask.mutate({
      content: parsed.content || value,
      projectId: task.projectId,
      sectionId: task.sectionId,
      parentId: task.id,
      priority: parsed.priority,
      due: parsed.due,
      labels: parsed.labels,
      ...(parsed.deadline ? { deadline: parsed.deadline } : {}),
    });
    setSubtaskText("");
    setAddingSubtask(false);
  }

  function saveCommentEdit() {
    if (!editingComment) return;
    const text = editingComment.text.trim();
    const was = task.comments?.find((c) => c.id === editingComment.id)?.text;
    if (text && text !== was) editComment.mutate({ taskId: task.id, commentId: editingComment.id, text });
    setEditingComment(null);
  }

  function submitComment() {
    const value = commentText.trim();
    if (!value) return;
    addComment.mutate({ taskId: task.id, text: value });
    setCommentText("");
  }

  /**
   * A task that's really a trip ("Weekend in Piran") becomes a project: its
   * date the trip's first day, its sub-tasks the project's tasks. The task
   * itself goes, unless it has notes, comments or files (then it moves in too).
   */
  async function makeTripProject() {
    const project = await createProject.mutateAsync({ name: task.content, color: "blue" });
    if (task.due) {
      const time = task.due.datetime ? format(new Date(task.due.datetime), "HH:mm") : undefined;
      await updateProject.mutateAsync({
        id: project.id,
        trip: { start: task.due.date, end: task.due.date, ...(time ? { startTime: time } : {}) },
      });
    }
    for (const sub of data?.tasks.filter((t) => t.parentId === task.id) ?? []) {
      await updateTask.mutateAsync({ id: sub.id, projectId: project.id, sectionId: null, parentId: null });
    }
    const keep = Boolean(task.description?.trim() || task.comments?.length || task.attachments?.length);
    if (keep) await updateTask.mutateAsync({ id: task.id, projectId: project.id, sectionId: null, parentId: null, due: null });
    else await deleteTask.mutateAsync(task.id);
    onClose();
    // On the project, with its trip dates to fill in.
    navigate(`${projectRoute(project.id)}?trip=1`);
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
        <div key={s.id} className="task-row td-subtask">
          <TaskCheckbox
            event={s.kind === "event"}
            completed={s.completed}
            priorityColor={PRIORITY_META[s.priority].color}
            recurring={!!s.due?.isRecurring}
            onToggle={(next) => completeTask.mutate({ id: s.id, completed: next })}
          />
          <div className="td-subtask-main" onClick={() => onOpenTask?.(s)}>
            <div className={`task-content ${s.completed ? "completed" : ""}`} style={{ fontSize: 13 }}>
              {s.content}
            </div>
            {/* Its date and time, and a deadline, as on the task lists. */}
            {!s.completed && (s.due || s.deadline) && (
              <div className="task-meta td-subtask-meta">
                {s.due && (
                  <span className={`due ${dueDateClass(s.due)}`}>
                    <CalendarIcon width={11} height={11} style={{ verticalAlign: "-1px" }} /> {formatDueLabel(s.due)}
                    {s.due.isRecurring && <RepeatIcon width={11} height={11} style={{ verticalAlign: "-1px", marginLeft: 2 }} />}
                  </span>
                )}
                {deadlineInfo(s.deadline) && (
                  <span className={`chip task-deadline is-${deadlineInfo(s.deadline)!.kind}`}>
                    <HourglassIcon width={11} height={11} style={{ verticalAlign: "-1px" }} /> {deadlineInfo(s.deadline)!.label}
                  </span>
                )}
              </div>
            )}
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
      {(task.comments || []).map((c) => {
        const author = commentAuthor(c.by, task, data, me);
        return (
        <div key={c.id} className="comment-row">
          <span className="comment-avatar" aria-hidden="true">
            {author?.photo ? (
              <img src={author.photo} alt="" referrerPolicy="no-referrer" />
            ) : (
              (author?.name ?? "").charAt(0).toUpperCase()
            )}
          </span>
          <div className="comment-body">
          {editingComment?.id === c.id ? (
            <div className="comment-edit">
              <textarea
                value={editingComment.text}
                autoFocus
                rows={Math.min(8, editingComment.text.split("\n").length + 1)}
                onChange={(e) => setEditingComment({ id: c.id, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    saveCommentEdit();
                  }
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setEditingComment(null);
                  }
                }}
              />
              <div className="comment-edit-actions">
                <button className="btn btn-text" onClick={() => setEditingComment(null)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={saveCommentEdit} disabled={!editingComment.text.trim()}>
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="comment-text">
              {linkParts(c.text).map((part, i) =>
                part.href ? (
                  <a
                    key={i}
                    href={part.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      // As in the notes: the browser, or the phone's own browser in the app.
                      e.preventDefault();
                      window.open(part.href, "_blank", "noopener,noreferrer");
                    }}
                  >
                    {part.text}
                  </a>
                ) : (
                  part.text
                )
              )}
            </div>
          )}
          <div className="comment-meta">
            {author && <b className="comment-by">{author.name}</b>}
            <span>
              {new Date(c.createdAt).toLocaleString()}
              {c.editedAt ? " · edited" : ""}
            </span>
            {/* Your own comments can be changed (and older ones, which don't say whose they are). */}
            {(!c.by || c.by === data?.me) && editingComment?.id !== c.id && (
              <button
                className="btn-text"
                style={{ padding: "0 0 0 8px", fontSize: 12 }}
                onClick={() => setEditingComment({ id: c.id, text: c.text })}
              >
                Edit
              </button>
            )}
            <button
              className="btn-text"
              style={{ padding: "0 0 0 8px", fontSize: 12 }}
              onClick={() => deleteComment.mutate({ taskId: task.id, commentId: c.id })}
            >
              Delete
            </button>
          </div>
          </div>
        </div>
        );
      })}
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
    const doneBy = completedByName(task, data);

    const deadline = deadlineInfo(task.deadline);
    function openDeadline() {
      const r = deadlineRow.current?.getBoundingClientRect();
      setDateAnchor({
        top: Math.max(8, Math.min((r?.bottom ?? 200) + 4, window.innerHeight - 480)),
        right: appUi ? 12 : Math.max(8, window.innerWidth - (r?.right ?? window.innerWidth - 12)),
      });
      setPickingDeadline(true);
    }

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
              {parentTask && !appUi ? (
                // Website: a clear way back up to the task this one belongs to.
                <button className="td-back" onClick={() => onOpenTask?.(parentTask)} title={`Back to ${parentTask.content}`}>
                  <ChevronIcon width={16} height={16} className="td-back-icon" />
                  <span className="td-back-label">Back to</span>
                  <span className="td-back-name">{parentTask.content}</span>
                </button>
              ) : parentTask ? (
                <button onClick={() => onOpenTask?.(parentTask)}>↰ {parentTask.content}</button>
              ) : (
                where || (hideMidvaFrom ? "Midva" : `Midva · from ${task.sharedBy?.name.split(" ")[0] || "your partner"}`)
              )}
            </div>
            <RowMenu
              label="Task"
              items={[
                { label: "Duplicate", icon: <CopyIcon width={16} height={16} />, onClick: duplicateTask },
                ...(!task.parentId
                  ? [{ label: "✈️ Make it a trip project", icon: <CalendarIcon width={16} height={16} />, onClick: () => void makeTripProject() }]
                  : []),
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
                event={task.kind === "event"}
                completed={task.completed || tick.busy}
                priorityColor={PRIORITY_META[task.priority].color}
                popping={tick.busy}
                onToggle={(next) => (next ? tickOff() : completeTask.mutate({ id: task.id, completed: false }))}
              />
              <textarea
                className={`td-title ${tick.busy ? "is-struck" : ""}`}
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
            {doneBy && (
              <div className="td-done-by">
                ✓ Ticked off by {doneBy === "You" ? "you" : doneBy}
                {task.completedAt ? `, ${format(parseISO(task.completedAt), "EEE d MMM, HH:mm")}` : ""}
              </div>
            )}
            <div className="td-desc">
              <RichTextEditor html={description} onChange={setDescription} onBlur={saveDescription} />
            </div>
            </div>

            <aside className="td-side">
            <div className="td-props">
              <PropRow
                icon={project?.isInboxProject ? <InboxIcon width={20} height={20} /> : <span className="td-hash">#</span>}
                caption="Project"
                value={where || (hideMidvaFrom ? "Midva" : `Midva · from ${task.sharedBy?.name.split(" ")[0] || "your partner"}`)}
                chevron={Boolean(project)}
              >
                {project && (
                  <Select
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
                  </Select>
                )}
              </PropRow>

              <PropRow
                ref={dateRow}
                icon={<CalendarIcon width={20} height={20} />}
                caption="Date"
                value={dueText || "No date"}
                muted={!due}
                color={due ? (isEvent(task) ? "var(--color-event)" : overdue ? "var(--color-danger)" : "var(--color-accent)") : undefined}
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

              {/* A task to tick off, or an event to go to (no tick, from–to). */}
              <label className="td-row td-row-switch td-event-row">
                <span className="td-row-icon">📅</span>
                <span className="td-row-body">
                  <span className="td-row-caption">Event</span>
                  <span className="td-row-value">{isEvent(task) ? "Something happening: no tick, never late" : "A task to tick off"}</span>
                </span>
                <input
                  type="checkbox"
                  className="td-switch"
                  checked={isEvent(task)}
                  onChange={(e) =>
                    updateTask.mutate(
                      e.target.checked
                        ? {
                            id: task.id,
                            kind: "event",
                            // An event needs a day: today unless it has one.
                            ...(task.due ? {} : { due: { date: todayISO(), string: "today", isRecurring: false } }),
                          }
                        : { id: task.id, kind: undefined, endTime: undefined }
                    )
                  }
                />
              </label>
              {isEvent(task) && task.due?.datetime && (
                <PropRow
                  ref={endRow}
                  icon={<span />}
                  caption="Until"
                  value={task.endTime ?? "No end time"}
                  muted={!task.endTime}
                  color={task.endTime ? "var(--color-event)" : undefined}
                  onClick={() => setPickingEnd(true)}
                  trailing={
                    task.endTime ? (
                      <button
                        className="td-clear"
                        aria-label="Clear end time"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateTask.mutate({ id: task.id, endTime: undefined });
                        }}
                      >
                        <XIcon width={16} height={16} />
                      </button>
                    ) : undefined
                  }
                />
              )}
              {pickingEnd && (
                <TimePickerPopup
                  time={task.endTime ?? ""}
                  anchor={{
                    top: (endRow.current?.getBoundingClientRect().bottom ?? 0) + 4,
                    left: endRow.current?.getBoundingClientRect().left ?? 0,
                  }}
                  onSave={(t) => {
                    setPickingEnd(false);
                    updateTask.mutate({ id: task.id, endTime: t || undefined });
                  }}
                  onCancel={() => setPickingEnd(false)}
                />
              )}

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
              {currentRule && !isEvent(task) && (
                <label className="td-row td-row-switch">
                  <span className="td-row-icon" />
                  <span className="td-row-body">
                    <span className="td-row-value">Count from when it's done</span>
                    <span className="td-row-sub">
                      Done today → next{" "}
                      {task.due && format(parseISO(nextOccurrence(task.due.date, currentRule, todayISO())), "d MMM")}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="td-switch"
                    checked={Boolean(currentRule.afterDone)}
                    onChange={(e) => setAfterDone(e.target.checked)}
                  />
                </label>
              )}

              {/* Simple (Settings): deadline, labels and location only show once they're set. */}
              {!(hideDeadline && !deadline) && (
              <PropRow
                ref={deadlineRow}
                icon={<HourglassIcon width={20} height={20} />}
                caption="Deadline"
                value={deadline ? `${deadline.label}${deadline.kind === "past" ? " · passed" : ""}` : "No deadline"}
                muted={!deadline}
                color={deadline ? (deadline.kind === "later" ? "var(--color-text)" : "var(--color-danger)") : undefined}
                onClick={openDeadline}
                trailing={
                  deadline ? (
                    <button
                      className="td-clear"
                      aria-label="Clear deadline"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateTask.mutate({ id: task.id, deadline: undefined });
                      }}
                    >
                      <XIcon width={16} height={16} />
                    </button>
                  ) : undefined
                }
              />
              )}

              <PropRow
                icon={<BellIcon width={20} height={20} />}
                caption="Reminders"
                value={taskReminders.length ? taskReminders.map(describeReminder).join(", ") : "No reminders"}
                muted={!taskReminders.length}
                color={taskReminders.length ? "var(--color-accent)" : undefined}
                onClick={() => setPickingReminders(true)}
                chevron
              />

              <PropRow
                icon={<FlagIcon width={20} height={20} />}
                caption="Priority"
                value={PRIORITY_META[task.priority].label}
                color={priorityColor}
                muted={!priorityColor}
                chevron
              >
                <Select
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
                </Select>
              </PropRow>

              {!(hideLabels && task.labels.length === 0) && (
              <div className="td-row td-row-labels">
                <span className="td-row-icon">
                  <TagIcon width={20} height={20} />
                </span>
                <div className="td-row-body">
                  <span className="td-row-caption">Labels</span>
                  <div className="td-label-chips">
                    {task.labels.map((l) => (
                      <span key={l} className="td-label-chip label-tint" style={labelTint(labelColor(l))}>
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
              )}

              {!(hideLocation && !task.location) && (
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
              )}
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

              {project && (project.members?.length ?? 0) > 1 ? (
                // In a shared project every task is already everyone's: no switch.
                <div className="td-row">
                  <span className="td-row-icon">
                    <ShareIcon width={20} height={20} />
                  </span>
                  <span className="td-row-body">
                    <span className="td-row-caption">Shared</span>
                    <span className="td-row-value">
                      With {projectPeople(project, data?.me, data?.partner) || "everyone on the project"}, like all of “
                      {project.name}”
                    </span>
                  </span>
                </div>
              ) : project && data?.partner && (
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

        {pickingDeadline && dateAnchor && (
          <div onClick={(e) => e.stopPropagation()}>
            <DatePickerPopup
              dateOnly
              value={task.deadline ? { date: task.deadline, string: task.deadline, isRecurring: false } : null}
              onPick={(d) => {
                updateTask.mutate({ id: task.id, deadline: d?.date ?? undefined });
                setPickingDeadline(false);
              }}
              anchor={dateAnchor}
              onClose={() => setPickingDeadline(false)}
            />
          </div>
        )}
        {pickingDate && dateAnchor && (
          <div onClick={(e) => e.stopPropagation()}>
            <DatePickerPopup taskId={task.id} anchor={dateAnchor} onClose={() => setPickingDate(false)} />
          </div>
        )}
        {pickingReminders && (
          <ReminderSheet
            due={task.due}
            reminders={taskReminders}
            me={data?.me}
            onChange={(next) => updateTask.mutate({ id: task.id, reminders: next })}
            onClose={() => setPickingReminders(false)}
          />
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

/** The other people on a shared project, by first name ("Maruša", "Maruša and Luka"). */
function projectPeople(project: Project, me: string | undefined, partner: Partner | null | undefined): string {
  const names = (project.members ?? [])
    .filter((uid) => uid !== me)
    .map((uid) => (partner?.uid === uid ? partner.name : project.memberProfiles?.[uid]?.name) ?? "")
    .map((n) => n.split(" ")[0])
    .filter(Boolean);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
