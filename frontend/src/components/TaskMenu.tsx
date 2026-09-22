import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Project, Task } from "../api/types";
import { useCreateTask, useDeleteTask, useRestoreTasks, useUpdateTask } from "../api/hooks";
import { useToast } from "./ToastProvider";
import { makeDue } from "../utils/date";
import { PRIORITY_META, PRIORITY_ORDER } from "../utils/priority";
import { ChevronIcon, CopyIcon, EditIcon, FlagIcon, LinkIcon, MoreIcon, MoveIcon, TrashIcon } from "./icons";
import DateQuickIcons from "./DateQuickIcons";
import DatePickerPopup from "./DatePickerPopup";

/**
 * The per-task "⋯" menu shown on hover in list rows and board cards,
 * matching Todoist's task menu. Skips Deadline, Reminders and Add
 * extension... -- the first two need data-model fields we don't have yet,
 * the third is a Todoist plugin marketplace with nothing to port to.
 */
export default function TaskMenu({
  task,
  projects,
  onEdit,
  onOpenTask,
}: {
  task: Task;
  /** Every other project a task could be moved into. */
  projects: Project[];
  onEdit: () => void;
  onOpenTask?: (task: Task) => void;
}) {
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const [showMoveTo, setShowMoveTo] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();
  const restoreTasks = useRestoreTasks();
  const showToast = useToast();

  function close() {
    setAnchor(null);
    setShowMoveTo(false);
    setShowDatePicker(false);
  }

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (anchor) {
      close();
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  function setDueOffset(days: number | null) {
    if (days === null) {
      updateTask.mutate({ id: task.id, due: null });
    } else {
      const date = new Date();
      date.setDate(date.getDate() + days);
      const label = days === 0 ? "Today" : days === 1 ? "Tomorrow" : date.toDateString();
      updateTask.mutate({ id: task.id, due: makeDue(date, label) });
    }
    close();
  }

  function setPriority(p: (typeof PRIORITY_ORDER)[number]) {
    updateTask.mutate({ id: task.id, priority: p });
    close();
  }

  function moveTo(projectId: string) {
    updateTask.mutate({ id: task.id, projectId, sectionId: null });
    close();
  }

  function duplicate() {
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
    close();
  }

  function copyLink() {
    const path = task.projectId === "inbox" ? "/app/inbox" : `/app/project/${task.projectId}`;
    const url = `${window.location.origin}${window.location.pathname}#${path}?open=${task.id}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => showToast({ message: "Link copied" }))
      .catch(() => showToast({ message: "Couldn't copy the link" }));
    close();
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
    close();
  }

  return (
    <span className="row-menu">
      <button
        ref={triggerRef}
        className="row-menu-trigger"
        aria-label="Task options"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={toggle}
      >
        <MoreIcon width={14} height={14} />
      </button>
      {anchor &&
        createPortal(
          <>
            <div className="dropdown-backdrop" onClick={(e) => (e.preventDefault(), e.stopPropagation(), close())} />
            <div
              className="dropdown-panel row-menu-panel task-menu-panel"
              style={{ top: anchor.top, right: anchor.right }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {showMoveTo ? (
                <>
                  <button
                    className="row-menu-item"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowMoveTo(false);
                    }}
                  >
                    <ChevronIcon width={14} height={14} style={{ transform: "rotate(90deg)" }} />
                    Back
                  </button>
                  {projects.length === 0 ? (
                    <div className="row-menu-item" style={{ opacity: 0.6, cursor: "default" }}>
                      No other projects
                    </div>
                  ) : (
                    projects.map((p) => (
                      <button
                        key={p.id}
                        className="row-menu-item"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          moveTo(p.id);
                        }}
                      >
                        {p.name}
                      </button>
                    ))
                  )}
                </>
              ) : (
                <>
                  <button
                    className="row-menu-item"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      close();
                      onEdit();
                    }}
                  >
                    <EditIcon width={14} height={14} />
                    Edit
                  </button>

                  <div className="task-menu-section-label">Date</div>
                  <div className="task-menu-inline-row">
                    <DateQuickIcons onPick={setDueOffset} onMore={() => setShowDatePicker(true)} />
                  </div>

                  <div className="task-menu-section-label">Priority</div>
                  <div className="task-menu-inline-row">
                    {PRIORITY_ORDER.map((p) => (
                      <button
                        key={p}
                        className="rich-text-btn"
                        title={PRIORITY_META[p].label}
                        style={task.priority === p ? { borderColor: PRIORITY_META[p].color } : undefined}
                        onClick={() => setPriority(p)}
                      >
                        <FlagIcon width={14} height={14} style={{ color: PRIORITY_META[p].color }} />
                      </button>
                    ))}
                  </div>

                  <div className="row-menu-divider" />

                  <button
                    className="row-menu-item"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowMoveTo(true);
                    }}
                  >
                    <MoveIcon width={14} height={14} />
                    Move to…
                  </button>
                  <button
                    className="row-menu-item"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      duplicate();
                    }}
                  >
                    <CopyIcon width={14} height={14} />
                    Duplicate
                  </button>
                  <button
                    className="row-menu-item"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      copyLink();
                    }}
                  >
                    <LinkIcon width={14} height={14} />
                    Copy link to task
                  </button>

                  <div className="row-menu-divider" />

                  <button
                    className="row-menu-item danger"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDelete();
                    }}
                  >
                    <TrashIcon width={14} height={14} />
                    Delete
                  </button>
                </>
              )}
            </div>
          </>,
          document.body
        )}
      {showDatePicker && anchor && (
        <DatePickerPopup
          taskId={task.id}
          anchor={{ top: anchor.top, right: Math.max(0, anchor.right - 280) }}
          onClose={close}
        />
      )}
    </span>
  );
}
