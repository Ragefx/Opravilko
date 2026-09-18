import { useState } from "react";
import type { ReactNode } from "react";
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
  header,
}: {
  title: string;
  tasks: Task[];
  quickAddProjectId?: string;
  quickAddDue?: { date: string; string: string } | null;
  groupLabel?: (task: Task) => string;
  showProjectChip?: boolean;
  projectNameById?: Record<string, string>;
  /** Replaces the default title bar, e.g. to add a List/Board toggle. */
  header?: ReactNode;
}) {
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const active = tasks.filter((t) => !t.completed).sort((a, b) => a.order - b.order);
  const completed = tasks.filter((t) => t.completed);

  // A task is "top-level" for this view if its parent isn't also present here
  // (e.g. the parent has a different due date and got filtered out of a Today/filter view).
  const activeIds = new Set(active.map((t) => t.id));
  const isTopLevel = (t: Task) => !t.parentId || !activeIds.has(t.parentId);
  const childrenOf = (id: string) => active.filter((t) => t.parentId === id);

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderTaskAndChildren(t: Task, depth: number): ReactNode {
    const children = childrenOf(t.id);
    const isCollapsed = collapsed.has(t.id);
    return (
      <div key={t.id}>
        <TaskRow
          task={t}
          onOpen={setOpenTask}
          depth={depth}
          projectLabel={showProjectChip ? projectNameById?.[t.projectId] : undefined}
          subtaskCount={
            children.length > 0
              ? { done: children.filter((c) => c.completed).length, total: children.length }
              : undefined
          }
          collapsed={isCollapsed}
          onToggleCollapse={() => toggleCollapse(t.id)}
        />
        {!isCollapsed && children.map((c) => renderTaskAndChildren(c, depth + 1))}
      </div>
    );
  }

  const groups = new Map<string, Task[]>();
  if (groupLabel) {
    for (const t of active.filter(isTopLevel)) {
      const key = groupLabel(t);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
  }

  return (
    <div className="content-scroll">
      {header ?? (
        <div className="topbar" style={{ padding: "0 0 16px", border: "none" }}>
          <h1>{title}</h1>
        </div>
      )}

      {quickAddProjectId && <QuickAdd projectId={quickAddProjectId} defaultDue={quickAddDue} />}

      {active.length === 0 && completed.length === 0 && (
        <div className="empty-state">Nothing here. Enjoy the quiet.</div>
      )}

      {groupLabel
        ? [...groups.entries()].map(([label, items]) => (
            <div key={label}>
              <div className="task-section-title">{label}</div>
              {items.map((t) => renderTaskAndChildren(t, 0))}
            </div>
          ))
        : active.filter(isTopLevel).map((t) => renderTaskAndChildren(t, 0))}

      {completed.length > 0 && (
        <>
          <div className="task-section-title">Completed</div>
          {completed.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={setOpenTask} />
          ))}
        </>
      )}

      {openTask && <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onOpenTask={setOpenTask} />}
    </div>
  );
}
