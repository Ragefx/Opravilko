import { useState } from "react";
import type { Task } from "../api/types";
import TaskRow from "./TaskRow";
import TaskDetail from "./TaskDetail";
import QuickAdd from "./QuickAdd";

export default function TaskListView({
  title,
  tasks,
  quickAddProjectId,
  quickAddDue,
  groupLabel,
  showProjectChip,
  projectNameById,
}: {
  title: string;
  tasks: Task[];
  quickAddProjectId?: string;
  quickAddDue?: { date: string; string: string } | null;
  groupLabel?: (task: Task) => string;
  showProjectChip?: boolean;
  projectNameById?: Record<string, string>;
}) {
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const active = tasks.filter((t) => !t.completed).sort((a, b) => a.order - b.order);
  const completed = tasks.filter((t) => t.completed);

  const groups = new Map<string, Task[]>();
  if (groupLabel) {
    for (const t of active) {
      const key = groupLabel(t);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
  }

  return (
    <div className="content-scroll">
      <div className="topbar" style={{ padding: "0 0 16px", border: "none" }}>
        <h1>{title}</h1>
      </div>

      {quickAddProjectId && <QuickAdd projectId={quickAddProjectId} defaultDue={quickAddDue} />}

      {active.length === 0 && completed.length === 0 && (
        <div className="empty-state">Nothing here. Enjoy the quiet.</div>
      )}

      {groupLabel
        ? [...groups.entries()].map(([label, items]) => (
            <div key={label}>
              <div className="task-section-title">{label}</div>
              {items.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onOpen={setOpenTask}
                  projectLabel={showProjectChip ? projectNameById?.[t.projectId] : undefined}
                />
              ))}
            </div>
          ))
        : active.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onOpen={setOpenTask}
              projectLabel={showProjectChip ? projectNameById?.[t.projectId] : undefined}
            />
          ))}

      {completed.length > 0 && (
        <>
          <div className="task-section-title">Completed</div>
          {completed.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={setOpenTask} />
          ))}
        </>
      )}

      {openTask && <TaskDetail task={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  );
}
