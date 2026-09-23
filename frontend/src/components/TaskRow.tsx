import { useRef, useState } from "react";
import type { Task } from "../api/types";
import { useBootstrap, useCompleteTask, useRevertRecurringCompletion } from "../api/hooks";
import { PRIORITY_META } from "../utils/priority";
import { dueDateClass, formatDueLabel } from "../utils/date";
import { CalendarIcon, CheckIcon, ChevronIcon, RepeatIcon } from "./icons";
import TaskCheckbox from "./TaskCheckbox";
import TaskMenu from "./TaskMenu";
import PriorityMark from "./PriorityMark";
import DatePickerPopup from "./DatePickerPopup";
import { useToast } from "./ToastProvider";

/** How far a finger has to drag a row before letting go triggers the action. */
const SWIPE_TRIGGER = 90;
const SWIPE_MAX = 140;

export default function TaskRow({
  task,
  onOpen,
  projectLabel,
  depth = 0,
  subtaskCount,
  collapsed,
  onToggleCollapse,
  carriedFrom,
}: {
  task: Task;
  onOpen: (task: Task) => void;
  projectLabel?: string;
  depth?: number;
  subtaskCount?: { done: number; total: number };
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** For a late task shown under today: the day it was due ("Tue"), marked as carried over. */
  carriedFrom?: string;
}) {
  const completeTask = useCompleteTask();
  const revertRecurring = useRevertRecurringCompletion();
  const showToast = useToast();
  const { data } = useBootstrap();
  const priorityColor = PRIORITY_META[task.priority].color;
  const otherProjects = (data?.projects || []).filter((p) => p.id !== task.projectId);

  // Touch swipe: right completes, left opens the date picker, like Todoist.
  const rowRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number; id: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [dx, setDx] = useState(0);
  const [dateAnchor, setDateAnchor] = useState<{ top: number; right: number } | null>(null);

  function completeWithUndo() {
    const previousDue = task.due;
    completeTask.mutate({ id: task.id, completed: true });
    showToast({
      message: task.due?.isRecurring ? "Moved to next occurrence" : "Task completed",
      actionLabel: "Undo",
      onAction: () =>
        task.due?.isRecurring
          ? revertRecurring.mutate({ id: task.id, due: previousDue })
          : completeTask.mutate({ id: task.id, completed: false }),
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== "touch" || task.completed) return;
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = swipe.current;
    if (!s || e.pointerId !== s.id) return;
    const moveX = e.clientX - s.x;
    const moveY = e.clientY - s.y;
    if (!s.active) {
      // Only claim clearly horizontal drags; vertical ones are page scrolls.
      if (Math.abs(moveY) > 12) {
        swipe.current = null;
        return;
      }
      if (Math.abs(moveX) < 12 || Math.abs(moveX) < Math.abs(moveY) * 1.5) return;
      s.active = true;
      try {
        rowRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already released -- the move handler still works without capture */
      }
    }
    setDx(Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, moveX)));
  }

  function onPointerEnd() {
    const s = swipe.current;
    swipe.current = null;
    if (!s?.active) return;
    suppressClick.current = true;
    const final = dx;
    setDx(0);
    if (final >= SWIPE_TRIGGER) {
      completeWithUndo();
    } else if (final <= -SWIPE_TRIGGER && rowRef.current) {
      const rect = rowRef.current.getBoundingClientRect();
      setDateAnchor({
        top: Math.min(rect.bottom + 4, window.innerHeight - 440),
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
  }

  const swipeDir = dx > 0 ? "right" : dx < 0 ? "left" : undefined;

  return (
    <div className="task-swipe-wrap" data-swipe={swipeDir}>
      {swipeDir && (
        <div className={`task-swipe-bg ${Math.abs(dx) >= SWIPE_TRIGGER ? "armed" : ""}`}>
          {swipeDir === "right" ? (
            <>
              <CheckIcon width={18} height={18} /> Complete
            </>
          ) : (
            <>
              Schedule <CalendarIcon width={18} height={18} />
            </>
          )}
        </div>
      )}
      <div
        ref={rowRef}
        className={`task-row ${carriedFrom ? "is-carried" : ""}`}
        style={{
          ...(depth > 0 ? { paddingLeft: depth * 28 } : {}),
          ...(dx ? { transform: `translateX(${dx}px)`, background: "var(--color-surface)" } : {}),
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(e) => {
          // The finger lifting after a swipe would otherwise also "click" the row.
          if (suppressClick.current) {
            suppressClick.current = false;
            e.stopPropagation();
            e.preventDefault();
          }
        }}
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
          completed={task.completed}
          priorityColor={priorityColor}
          recurring={!!task.due?.isRecurring}
          onToggle={(next) => completeTask.mutate({ id: task.id, completed: next })}
        />
        <div className="task-main">
          <div className={`task-content ${task.completed ? "completed" : ""}`} onClick={() => onOpen(task)}>
            {task.content}
            {subtaskCount && (
              <span className="chip" style={{ marginLeft: 8 }}>
                {subtaskCount.done}/{subtaskCount.total}
              </span>
            )}
          </div>
          {(task.due || task.labels.length > 0 || projectLabel) && (
            <div className="task-meta">
              {task.due && carriedFrom ? (
                <span className="due carried">
                  ↪ carried over from {carriedFrom}
                  {task.due.isRecurring && (
                    <RepeatIcon width={12} height={12} style={{ verticalAlign: "-2px", marginLeft: 4 }} />
                  )}
                </span>
              ) : task.due && (
                <span className={`due ${dueDateClass(task.due)}`}>
                  <CalendarIcon width={12} height={12} style={{ verticalAlign: "-2px" }} /> {formatDueLabel(task.due)}
                  {task.due.isRecurring && (
                    <RepeatIcon width={12} height={12} style={{ verticalAlign: "-2px", marginLeft: 2 }} />
                  )}
                </span>
              )}
              {task.labels.map((l) => (
                <span key={l} className="chip">
                  @{l}
                </span>
              ))}
              {projectLabel && <span className="chip">{projectLabel}</span>}
            </div>
          )}
        </div>
        {!task.completed && <PriorityMark priority={task.priority} />}
        <TaskMenu task={task} projects={otherProjects} onEdit={() => onOpen(task)} onOpenTask={onOpen} />
      </div>
      {dateAnchor && <DatePickerPopup taskId={task.id} anchor={dateAnchor} onClose={() => setDateAnchor(null)} />}
    </div>
  );
}
