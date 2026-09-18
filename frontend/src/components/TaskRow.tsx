import type { Task } from "../api/types";
import { useCompleteTask } from "../api/hooks";
import { PRIORITY_META } from "../utils/priority";
import { formatDueLabel, isDueToday, isOverdue } from "../utils/date";
import { CheckIcon } from "./icons";

export default function TaskRow({
  task,
  onOpen,
  projectLabel,
}: {
  task: Task;
  onOpen: (task: Task) => void;
  projectLabel?: string;
}) {
  const completeTask = useCompleteTask();
  const priorityColor = PRIORITY_META[task.priority].color;
  const overdue = isOverdue(task.due);
  const dueToday = isDueToday(task.due);

  return (
    <div className="task-row">
      <button
        className={`task-checkbox ${task.completed ? "checked" : ""}`}
        style={{ ["--priority-color" as any]: priorityColor }}
        onClick={() => completeTask.mutate({ id: task.id, completed: !task.completed })}
        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
      >
        {task.completed && <CheckIcon />}
      </button>
      <div className="task-main">
        <div className={`task-content ${task.completed ? "completed" : ""}`} onClick={() => onOpen(task)}>
          {task.content}
        </div>
        {(task.due || task.labels.length > 0 || projectLabel) && (
          <div className="task-meta">
            {task.due && (
              <span className={`due ${overdue ? "overdue" : ""} ${dueToday ? "today" : ""}`}>
                {formatDueLabel(task.due)}
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
    </div>
  );
}
