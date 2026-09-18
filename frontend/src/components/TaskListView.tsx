import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../api/types";
import { useReorderTasks } from "../api/hooks";
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
  reorderable,
  autoOpenTaskId,
  groupExtra,
  preserveOrder,
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
  /** Enables drag-to-reorder for the flat (non-grouped) top-level list, e.g. within a single project. */
  reorderable?: boolean;
  /** Opens this task's detail panel as soon as it's found, e.g. from a search result deep link. */
  autoOpenTaskId?: string;
  /** Renders extra controls (e.g. a "Reschedule" button) next to a given group's title. */
  groupExtra?: (label: string, items: Task[]) => ReactNode;
  /** Trusts the incoming order of `tasks` instead of re-sorting by the manual `order` field. */
  preserveOrder?: boolean;
}) {
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const reorderTasks = useReorderTasks();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (!autoOpenTaskId) return;
    const t = tasks.find((x) => x.id === autoOpenTaskId);
    if (t) setOpenTask(t);
  }, [autoOpenTaskId, tasks]);

  const active = preserveOrder
    ? tasks.filter((t) => !t.completed)
    : tasks.filter((t) => !t.completed).sort((a, b) => a.order - b.order);
  const completed = tasks.filter((t) => t.completed);

  // A task is "top-level" for this view if its parent isn't also present here
  // (e.g. the parent has a different due date and got filtered out of a Today/filter view).
  const activeIds = new Set(active.map((t) => t.id));
  const isTopLevel = (t: Task) => !t.parentId || !activeIds.has(t.parentId);
  const childrenOf = (id: string) => active.filter((t) => t.parentId === id);
  const topLevel = active.filter(isTopLevel);

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;
    const oldIndex = topLevel.findIndex((t) => t.id === dragged.id);
    const newIndex = topLevel.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(topLevel, oldIndex, newIndex);
    reorderTasks.mutate(reordered.map((t, idx) => ({ id: t.id, sectionId: t.sectionId, order: idx })));
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
    for (const t of topLevel) {
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
              <div className="task-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>{label}</span>
                {groupExtra?.(label, items)}
              </div>
              {items.map((t) => renderTaskAndChildren(t, 0))}
            </div>
          ))
        : reorderable
          ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={topLevel.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  {topLevel.map((t) => (
                    <SortableTaskItem key={t.id} id={t.id}>
                      {renderTaskAndChildren(t, 0)}
                    </SortableTaskItem>
                  ))}
                </SortableContext>
              </DndContext>
            )
          : topLevel.map((t) => renderTaskAndChildren(t, 0))}

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

function SortableTaskItem({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}
