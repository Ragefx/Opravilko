import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Task } from "../api/types";
import { useCompleteTask } from "../api/hooks";
import { PRIORITY_META } from "../utils/priority";
import { formatDueLabel, isDueToday, isOverdue } from "../utils/date";
import { CalendarIcon, RepeatIcon } from "./icons";
import TaskCheckbox from "./TaskCheckbox";
import TaskDetail from "./TaskDetail";
import QuickAdd from "./QuickAdd";

export interface DateBoardColumn {
  key: string;
  label: string;
  tasks: Task[];
  /** Extra control rendered at the right edge of the header, e.g. "Reschedule". */
  extra?: ReactNode;
  /** Shows a "+ Add task" row at the bottom of this column, pre-filled with this due date. */
  quickAdd?: { projectId: string; due: { date: string; string: string } | null };
}

/**
 * A board laid out by date group (Overdue / Today / ...) instead of by a
 * project's sections -- used by Today (and could extend to Upcoming). Cards
 * reuse BoardView's `.board-card` styling for a consistent look, but there's
 * no drag-and-drop here: a task's column is derived from its due date, not a
 * position a user can set directly.
 */
export default function DateBoardView({
  columns,
  projectNameById,
  autoOpenTaskId,
}: {
  columns: DateBoardColumn[];
  projectNameById?: Record<string, string>;
  autoOpenTaskId?: string;
}) {
  const [openTask, setOpenTask] = useState<Task | null>(null);

  useEffect(() => {
    if (!autoOpenTaskId) return;
    const t = columns.flatMap((c) => c.tasks).find((x) => x.id === autoOpenTaskId);
    if (t) setOpenTask(t);
  }, [autoOpenTaskId, columns]);

  return (
    <div className="board-scroll">
      <div className="board">
        {columns.map((col) => (
          <div key={col.key} className="board-column">
            <div className="board-column-header">
              <span>{col.label}</span>
              <span className="badge">{col.tasks.length}</span>
              {col.extra}
            </div>
            <div className="board-column-body">
              {col.tasks.map((t) => (
                <DateBoardCard
                  key={t.id}
                  task={t}
                  projectLabel={projectNameById?.[t.projectId]}
                  onOpen={setOpenTask}
                />
              ))}
            </div>
            {col.quickAdd && <QuickAdd projectId={col.quickAdd.projectId} defaultDue={col.quickAdd.due} />}
          </div>
        ))}
      </div>
      {openTask && <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onOpenTask={setOpenTask} />}
    </div>
  );
}

function DateBoardCard({
  task,
  projectLabel,
  onOpen,
}: {
  task: Task;
  projectLabel?: string;
  onOpen: (task: Task) => void;
}) {
  const completeTask = useCompleteTask();
  const priorityColor = PRIORITY_META[task.priority].color;
  const overdue = isOverdue(task.due);
  const dueToday = isDueToday(task.due);

  return (
    <div className="board-card" style={{ cursor: "pointer" }} onClick={() => onOpen(task)}>
      <div className="board-card-top">
        <TaskCheckbox
          completed={task.completed}
          priorityColor={priorityColor}
          recurring={!!task.due?.isRecurring}
          onToggle={() => completeTask.mutate({ id: task.id, completed: true })}
        />
        <div className="board-card-content">
          {task.content}
          {(task.due || projectLabel) && (
            <div className="task-meta">
              {task.due && (
                <span className={`due ${overdue ? "overdue" : ""} ${dueToday ? "today" : ""}`}>
                  <CalendarIcon width={12} height={12} style={{ verticalAlign: "-2px" }} />{" "}
                  {formatDueLabel(task.due)}
                  {task.due.isRecurring && (
                    <RepeatIcon width={12} height={12} style={{ verticalAlign: "-2px", marginLeft: 2 }} />
                  )}
                </span>
              )}
              {projectLabel && <span className="chip">{projectLabel}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
