import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useBootstrap, useCompleteTask, useCreateSection, useReorderTasks, useUpdateSection } from "../api/hooks";
import type { Task } from "../api/types";
import TaskDetail from "./TaskDetail";
import QuickAdd from "./QuickAdd";
import TaskCheckbox from "./TaskCheckbox";
import { PRIORITY_META } from "../utils/priority";
import { formatDueLabel, isDueToday, isOverdue } from "../utils/date";
import { RepeatIcon } from "./icons";

const UNSECTIONED = "__none__";

interface Column {
  key: string;
  sectionId: string | null;
  name: string;
  tasks: Task[];
}

export default function BoardView({
  projectId,
  autoOpenTaskId,
}: {
  projectId: string;
  autoOpenTaskId?: string;
}) {
  const { data } = useBootstrap();
  const reorderTasks = useReorderTasks();
  const createSection = useCreateSection();
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [columns, setColumns] = useState<Column[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  useEffect(() => {
    if (!autoOpenTaskId || !data) return;
    const t = data.tasks.find((x) => x.id === autoOpenTaskId);
    if (t) setOpenTask(t);
  }, [autoOpenTaskId, data]);

  useEffect(() => {
    if (!data) return;
    const sections = data.sections
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => a.order - b.order);
    const allTasks = data.tasks.filter((t) => t.projectId === projectId && !t.completed && !t.parentId);

    const cols: Column[] = sections.map((s) => ({
      key: s.id,
      sectionId: s.id,
      name: s.name,
      tasks: allTasks.filter((t) => t.sectionId === s.id).sort((a, b) => a.order - b.order),
    }));

    const unsectioned = allTasks.filter((t) => t.sectionId === null).sort((a, b) => a.order - b.order);
    if (unsectioned.length > 0 || sections.length === 0) {
      cols.unshift({
        key: UNSECTIONED,
        sectionId: null,
        name: sections.length === 0 ? "Tasks" : "To-do",
        tasks: unsectioned,
      });
    }
    setColumns(cols);
  }, [data, projectId]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function findColumnByTaskId(id: string): Column | undefined {
    return columns.find((c) => c.tasks.some((t) => t.id === id));
  }
  function findColumnByKey(key: string): Column | undefined {
    return columns.find((c) => c.key === key);
  }

  function handleDragStart(event: DragStartEvent) {
    const task = columns.flatMap((c) => c.tasks).find((t) => t.id === event.active.id);
    setActiveTask(task || null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const sourceCol = findColumnByTaskId(activeId);
    if (!sourceCol) return;
    const destCol = findColumnByTaskId(overId) || findColumnByKey(overId);
    if (!destCol || sourceCol.key === destCol.key) return;

    setColumns((prev) => {
      const next = prev.map((c) => ({ ...c, tasks: [...c.tasks] }));
      const src = next.find((c) => c.key === sourceCol.key)!;
      const dst = next.find((c) => c.key === destCol.key)!;
      const taskIdx = src.tasks.findIndex((t) => t.id === activeId);
      if (taskIdx === -1) return prev;
      const [moved] = src.tasks.splice(taskIdx, 1);
      const overIdx = dst.tasks.findIndex((t) => t.id === overId);
      dst.tasks.splice(overIdx >= 0 ? overIdx : dst.tasks.length, 0, { ...moved, sectionId: dst.sectionId });
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    setColumns((prev) => {
      const next = prev.map((c) => ({ ...c, tasks: [...c.tasks] }));
      const col = next.find((c) => c.tasks.some((t) => t.id === activeId));
      if (col && activeId !== overId) {
        const oldIdx = col.tasks.findIndex((t) => t.id === activeId);
        const newIdx = col.tasks.findIndex((t) => t.id === overId);
        if (oldIdx >= 0 && newIdx >= 0) {
          col.tasks = arrayMove(col.tasks, oldIdx, newIdx);
        }
      }

      const updates: { id: string; sectionId: string | null; order: number }[] = [];
      next.forEach((c) => {
        c.tasks.forEach((t, idx) => {
          updates.push({ id: t.id, sectionId: c.sectionId, order: idx });
        });
      });
      reorderTasks.mutate(updates);
      return next;
    });
  }

  function submitNewSection() {
    if (!newSectionName.trim()) return;
    createSection.mutate(
      { name: newSectionName.trim(), projectId },
      { onSuccess: () => { setNewSectionName(""); setAddingSection(false); } }
    );
  }

  return (
    <div className="board-scroll">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="board">
          {columns.map((col) => (
            <BoardColumn key={col.key} column={col} onOpenTask={setOpenTask} projectId={projectId} />
          ))}
          <div className="board-column board-add-section-col">
            {addingSection ? (
              <div className="quick-add">
                <input
                  autoFocus
                  placeholder="Section name"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitNewSection();
                    if (e.key === "Escape") setAddingSection(false);
                  }}
                />
                <div className="quick-add-actions">
                  <button className="btn btn-text" onClick={() => setAddingSection(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={submitNewSection} disabled={!newSectionName.trim()}>
                    Add
                  </button>
                </div>
              </div>
            ) : (
              <button className="add-task-trigger" onClick={() => setAddingSection(true)}>
                <span className="plus">+</span> Add section
              </button>
            )}
          </div>
        </div>
        <DragOverlay>{activeTask ? <BoardCardPreview task={activeTask} /> : null}</DragOverlay>
      </DndContext>
      {openTask && <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onOpenTask={setOpenTask} />}
    </div>
  );
}

function BoardColumn({
  column,
  onOpenTask,
  projectId,
}: {
  column: Column;
  onOpenTask: (task: Task) => void;
  projectId: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  const updateSection = useUpdateSection();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(column.name);
  const canRename = column.sectionId !== null;

  useEffect(() => {
    setName(column.name);
  }, [column.name]);

  function saveName() {
    setRenaming(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === column.name) {
      setName(column.name);
      return;
    }
    updateSection.mutate({ id: column.sectionId!, name: trimmed });
  }

  return (
    <div className={`board-column ${isOver ? "is-drop-target" : ""}`}>
      <div className="board-column-header">
        {renaming ? (
          <input
            autoFocus
            className="board-column-rename-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") {
                setName(column.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <span
            onClick={() => canRename && setRenaming(true)}
            style={canRename ? { cursor: "text" } : undefined}
            title={canRename ? "Click to rename" : undefined}
          >
            {column.name}
          </span>
        )}
        <span className="badge">{column.tasks.length}</span>
      </div>
      <div ref={setNodeRef} className="board-column-body">
        <SortableContext items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {column.tasks.map((t) => (
            <BoardCard key={t.id} task={t} onOpen={onOpenTask} />
          ))}
        </SortableContext>
      </div>
      <QuickAdd projectId={projectId} sectionId={column.sectionId} />
    </div>
  );
}

function BoardCard({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const completeTask = useCompleteTask();
  const { data } = useBootstrap();
  const subtasks = (data?.tasks || []).filter((t) => t.parentId === task.id);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const priorityColor = PRIORITY_META[task.priority].color;
  const overdue = isOverdue(task.due);
  const dueToday = isDueToday(task.due);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="board-card"
      onClick={() => onOpen(task)}
    >
      <div className="board-card-top">
        <TaskCheckbox
          completed={task.completed}
          priorityColor={priorityColor}
          recurring={!!task.due?.isRecurring}
          onToggle={() => completeTask.mutate({ id: task.id, completed: true })}
          ariaLabel="Mark complete"
        />
        <div className="board-card-content">
          {task.content}
          {subtasks.length > 0 && (
            <span className="chip" style={{ marginLeft: 8 }}>
              {subtasks.filter((s) => s.completed).length}/{subtasks.length}
            </span>
          )}
        </div>
      </div>
      {(task.due || task.labels.length > 0) && (
        <div className="task-meta">
          {task.due && (
            <span className={`due ${overdue ? "overdue" : ""} ${dueToday ? "today" : ""}`}>
              {task.due.isRecurring && <RepeatIcon width={12} height={12} style={{ verticalAlign: "-2px" }} />}{" "}
              {formatDueLabel(task.due)}
            </span>
          )}
          {task.labels.map((l) => (
            <span key={l} className="chip">
              @{l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BoardCardPreview({ task }: { task: Task }) {
  return (
    <div className="board-card board-card-preview">
      <div className="board-card-top">
        <div
          className="task-checkbox"
          style={{ ["--priority-color" as any]: PRIORITY_META[task.priority].color }}
        />
        <div className="board-card-content">{task.content}</div>
      </div>
    </div>
  );
}
