import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CalendarEvent, Task } from "../api/types";
import { useBootstrap, useReorderTasks } from "../api/hooks";
import TaskRow from "./TaskRow";
import TaskDetail from "./TaskDetail";
import QuickAdd from "./QuickAdd";
import CalendarEventRow from "./CalendarEventRow";
import { CheckCircleIcon } from "./icons";

export interface DateGroup {
  label: string;
  /** "yyyy-MM-dd" for looking up that day's calendar events. */
  date: string | null;
  /** Show the group even with no tasks or events (e.g. every day in Upcoming). */
  keepEmpty?: boolean;
  /** Adds a "+ Add task" at the end of the group, pre-filled with this project/date. */
  quickAdd?: { projectId: string; due: { date: string; string: string } | null };
}

export default function TaskListView({
  title,
  subtitle,
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
  eventsByDate,
  dateGroups,
}: {
  title: string;
  /** Secondary line under the title, e.g. the date and task count. */
  subtitle?: string;
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
  /** Subscribed-calendar events to show under each date group, keyed by "yyyy-MM-dd". */
  eventsByDate?: Map<string, CalendarEvent[]>;
  /**
   * The date groups to show, in order, each matched to tasks by `groupLabel`.
   * Lets a day with only calendar events (no tasks) still appear, and keeps
   * days in date order regardless of the tasks' manual order.
   */
  dateGroups?: DateGroup[];
}) {
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const reorderTasks = useReorderTasks();
  const allTasks = useBootstrap().data?.tasks;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // On touch, dragging needs a long-press so swipes and scrolling still work.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } })
  );

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
  /** Rendered children: only the ones still open, since completed rows live in their own section. */
  const childrenOf = (id: string) => active.filter((t) => t.parentId === id);
  /**
   * Progress is counted against the full dataset, not `tasks` -- callers filter
   * completed items out before passing them in, which would pin the badge at 0/n.
   */
  const subtaskProgress = (id: string) => {
    const all = (allTasks ?? tasks).filter((t) => t.parentId === id);
    return all.length > 0 ? { done: all.filter((t) => t.completed).length, total: all.length } : undefined;
  };
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
          subtaskCount={subtaskProgress(t.id)}
          collapsed={isCollapsed}
          onToggleCollapse={children.length > 0 ? () => toggleCollapse(t.id) : undefined}
        />
        {!isCollapsed && children.map((c) => renderTaskAndChildren(c, depth + 1))}
      </div>
    );
  }

  const tasksByLabel = new Map<string, Task[]>();
  if (groupLabel) {
    for (const t of topLevel) {
      const key = groupLabel(t);
      if (!tasksByLabel.has(key)) tasksByLabel.set(key, []);
      tasksByLabel.get(key)!.push(t);
    }
  }
  const eventsFor = (date: string | null | undefined) => (date ? eventsByDate?.get(date) ?? [] : []);
  type Group = { label: string; items: Task[]; events: CalendarEvent[]; spec?: DateGroup };
  const groups: Group[] = dateGroups
    ? ([
        ...dateGroups.map((g): Group => ({
          label: g.label,
          items: tasksByLabel.get(g.label) ?? [],
          events: eventsFor(g.date),
          spec: g,
        })),
        ...[...tasksByLabel.entries()]
          .filter(([label]) => !dateGroups.some((g) => g.label === label))
          .map(([label, items]): Group => ({ label, items, events: [] })),
      ] as Group[]).filter((g) => g.items.length > 0 || g.events.length > 0 || g.spec?.keepEmpty)
    : [...tasksByLabel.entries()].map(([label, items]) => ({ label, items, events: eventsFor(items[0]?.due?.date) }));
  const hasEvents = groups.some((g) => g.events.length > 0);

  return (
    <div className="content-scroll">
      {header ?? (
        <div className="page-header">
          <div>
            <h1>{title}</h1>
            {subtitle && <div className="page-subtitle">{subtitle}</div>}
          </div>
        </div>
      )}

      {quickAddProjectId && <QuickAdd projectId={quickAddProjectId} defaultDue={quickAddDue} />}

      {active.length === 0 && completed.length === 0 && !hasEvents && !dateGroups?.some((g) => g.keepEmpty) && (
        <div className="empty-state">
          <CheckCircleIcon width={40} height={40} />
          <p>All clear</p>
          <span>Nothing due here. Add a task above, or press q from anywhere.</span>
        </div>
      )}

      {groupLabel
        ? groups.map(({ label, items, events, spec }) => (
            <div key={label} className="task-group">
              <div className="task-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>{label}</span>
                {groupExtra?.(label, items)}
              </div>
              {events.map((e) => (
                <CalendarEventRow key={e.id} event={e} />
              ))}
              {items.map((t) => renderTaskAndChildren(t, 0))}
              {spec?.quickAdd && <QuickAdd projectId={spec.quickAdd.projectId} defaultDue={spec.quickAdd.due} />}
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
