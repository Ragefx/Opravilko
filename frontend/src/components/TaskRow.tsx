import type { Task } from "../api/types";
import { useBootstrap, useCompleteTask, useDeleteTask, useRestoreTasks, useRevertRecurringCompletion } from "../api/hooks";
import { PRIORITY_META } from "../utils/priority";
import { taskDueClass, taskDueLabel, taskTimeLabel } from "../utils/events";
import { BellIcon, CalendarIcon, CheckIcon, ClockIcon, ChevronIcon, HourglassIcon, PaperclipIcon, MapPinIcon, RepeatIcon, TrashIcon } from "./icons";
import { remindersOf } from "../utils/reminders";
import TaskCheckbox from "./TaskCheckbox";
import { useCompleteAnimation } from "./useCompleteAnimation";
import { useSwipeActions } from "./useSwipeActions";
import { useSwipeTasks } from "../utils/swipeTasks";
import TaskMenu from "./TaskMenu";
import { appUi } from "../utils/appUi";
import PriorityMark from "./PriorityMark";
import MidvaBadge from "./MidvaBadge";
import { useToast } from "./ToastProvider";
import { completedByName } from "../utils/completedBy";
import { deadlineInfo } from "../utils/deadline";
import LabelChip from "./LabelChip";

export default function TaskRow({
  task,
  onOpen,
  projectLabel,
  depth = 0,
  subtaskCount,
  collapsed,
  onToggleCollapse,
  day,
}: {
  task: Task;
  onOpen: (task: Task) => void;
  projectLabel?: string;
  depth?: number;
  subtaskCount?: { done: number; total: number };
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** The day the list shows it under ("yyyy-MM-dd"): on that day only the time is shown, not the date again. */
  day?: string;
}) {
  const completeTask = useCompleteTask();
  const revertRecurring = useRevertRecurringCompletion();
  const tick = useCompleteAnimation();
  const recurring = !!task.due?.isRecurring;
  const hasReminders = !task.completed && remindersOf(task).length > 0;
  // Under its own day's heading, a task without a time (or repeat or reminder) needs no date line.
  const dueShown = Boolean(task.due && (task.due.date !== day || task.due.datetime || task.due.isRecurring || hasReminders));
  const showToast = useToast();
  const { data } = useBootstrap();
  const doneBy = completedByName(task, data);
  const deadline = task.completed ? null : deadlineInfo(task.deadline);
  const priorityColor = PRIORITY_META[task.priority].color;
  const otherProjects = (data?.projects || []).filter((p) => p.id !== task.projectId);

  // Touch swipe (when on in Settings): right completes (green), left deletes (red); both can be undone.
  const swipeOn = useSwipeTasks();
  const deleteTask = useDeleteTask();
  const restoreTasks = useRestoreTasks();

  function deleteWithUndo() {
    deleteTask.mutate(task.id, {
      onSuccess: (removed) =>
        showToast({
          message: `"${task.content}" deleted`,
          actionLabel: "Undo",
          onAction: () => restoreTasks.mutate(removed),
        }),
    });
  }

  function completeWithUndo() {
    const previousDue = task.due;
    tick.play(() => completeTask.mutate({ id: task.id, completed: true }), { fold: !recurring });
    showToast({
      message: task.due?.isRecurring ? "Moved to next occurrence" : "Task completed",
      actionLabel: "Undo",
      onAction: () =>
        task.due?.isRecurring
          ? revertRecurring.mutate({ id: task.id, due: previousDue })
          : completeTask.mutate({ id: task.id, completed: false }),
    });
  }

  const swipe = useSwipeActions({ onRight: completeWithUndo, onLeft: deleteWithUndo, disabled: task.completed || !swipeOn || task.kind === "event" });
  const dx = swipe.dx;
  const swipeDir = swipe.dir;

  return (
    <div
      ref={tick.foldRef}
      className={`task-swipe-wrap ${tick.phase === "folding" ? "is-folding" : ""}`}
      data-swipe={swipeDir}
    >
      {swipeDir && (
        <div className={`task-swipe-bg ${swipe.armed ? "armed" : ""}`}>
          {swipeDir === "right" ? (
            <>
              <CheckIcon width={18} height={18} /> Complete
            </>
          ) : (
            <>
              Delete <TrashIcon width={18} height={18} />
            </>
          )}
        </div>
      )}
      <div
        ref={swipe.rowRef}
        className="task-row"
        style={{
          ...(depth > 0 ? { paddingLeft: depth * 28 } : {}),
          ...(dx ? { transform: `translateX(${dx}px)`, background: "var(--color-surface)" } : {}),
        }}
        {...swipe.handlers}
      >
        {onToggleCollapse ? (
          <button
            className="task-collapse-toggle"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sub-tasks" : "Collapse sub-tasks"}
          >
            <ChevronIcon width={14} height={14} style={{ transform: collapsed ? "rotate(-90deg)" : undefined }} />
          </button>
        ) : (
          <span className="task-collapse-spacer" />
        )}
        <TaskCheckbox
            event={task.kind === "event"}
          completed={task.completed || tick.busy}
          priorityColor={priorityColor}
          popping={tick.busy}
          onToggle={(next) =>
            next
              ? tick.play(() => completeTask.mutate({ id: task.id, completed: true }), { fold: !recurring })
              : completeTask.mutate({ id: task.id, completed: false })
          }
        />
        <div className="task-main">
          <div
            className={`task-content ${task.completed ? "completed" : ""} ${tick.busy ? "is-striking" : ""}`}
            onClick={() => onOpen(task)}
          >
            <span className="task-content-text">{task.content}</span>
            {subtaskCount && (
              <span className="chip" style={{ marginLeft: 8 }}>
                {subtaskCount.done}/{subtaskCount.total}
              </span>
            )}
          </div>
          {(doneBy || deadline || dueShown || hasReminders || task.labels.length > 0 || projectLabel || task.sharedWith?.length || task.attachments?.length || task.location) && (
            <div className="task-meta">
              {doneBy && <span className="task-done-by">✓ {doneBy}</span>}
              {dueShown && task.due && (
                <span className={`due ${taskDueClass(task)}`}>
                  {task.due.date === day ? (
                    task.due.datetime ? (
                      <>
                        <ClockIcon width={12} height={12} style={{ verticalAlign: "-2px" }} /> {taskTimeLabel(task)}
                      </>
                    ) : null
                  ) : (
                    <>
                      <CalendarIcon width={12} height={12} style={{ verticalAlign: "-2px" }} /> {taskDueLabel(task)}
                    </>
                  )}
                  {task.due.isRecurring && (
                    <RepeatIcon width={12} height={12} style={{ verticalAlign: "-2px", marginLeft: 2 }} />
                  )}
                  {hasReminders && <BellIcon width={12} height={12} aria-label="Has reminders" style={{ verticalAlign: "-2px", marginLeft: 2 }} />}
                </span>
              )}
              {deadline && (
                <span className={`chip task-deadline is-${deadline.kind}`} title="Deadline">
                  <HourglassIcon width={12} height={12} style={{ verticalAlign: "-2px" }} /> {deadline.label}
                </span>
              )}
              {!task.due && hasReminders && (
                <span className="chip" title="Reminders">
                  <BellIcon width={12} height={12} style={{ verticalAlign: "-2px" }} />
                </span>
              )}
              {task.labels.map((l) => (
                <LabelChip key={l} name={l} />
              ))}
              {projectLabel && <span className="chip">{projectLabel}</span>}
              {task.sharedWith?.length ? <MidvaBadge task={task} /> : null}
              {task.location && (
                <span className="chip task-location-chip" title={[task.location.name, task.location.address].filter(Boolean).join(", ")}>
                  <MapPinIcon width={12} height={12} style={{ verticalAlign: "-2px" }} /> {task.location.name}
                </span>
              )}
              {task.attachments?.length ? (
                <span className="chip" title={`${task.attachments.length} attachment${task.attachments.length === 1 ? "" : "s"}`}>
                  <PaperclipIcon width={12} height={12} style={{ verticalAlign: "-2px" }} /> {task.attachments.length}
                </span>
              ) : null}
            </div>
          )}
        </div>
        {!task.completed && <PriorityMark priority={task.priority} />}
        {/* The app opens the full task on a tap, so no ⋯ menu there. */}
        {!appUi && <TaskMenu task={task} projects={otherProjects} onEdit={() => onOpen(task)} onOpenTask={onOpen} />}
      </div>
    </div>
  );
}
