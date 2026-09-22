import type { Task } from "../api/types";
import { useBootstrap, useCompleteTask } from "../api/hooks";
import { PRIORITY_META } from "../utils/priority";
import { dueDateClass, formatDueLabel } from "../utils/date";
import { CalendarIcon, ChevronIcon, RepeatIcon } from "./icons";
import TaskCheckbox from "./TaskCheckbox";
import TaskMenu from "./TaskMenu";

export default function TaskRow({
  task,
  onOpen,
  projectLabel,
  depth = 0,
  subtaskCount,
  collapsed,
  onToggleCollapse,
}: {
  task: Task;
  onOpen: (task: Task) => void;
  projectLabel?: string;
  depth?: number;
  subtaskCount?: { done: number; total: number };
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const completeTask = useCompleteTask();
  const { data } = useBootstrap();
  const priorityColor = PRIORITY_META[task.priority].color;
  const otherProjects = (data?.projects || []).filter((p) => p.id !== task.projectId);

  return (
    <div className="task-row" style={depth > 0 ? { paddingLeft: depth * 28 } : undefined}>
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
            {task.due && (
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
      <TaskMenu task={task} projects={otherProjects} onEdit={() => onOpen(task)} onOpenTask={onOpen} />
    </div>
  );
}
