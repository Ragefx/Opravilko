import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  type CollisionDetection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useBootstrap, useCompleteTask, useCreateSection, useReorderTasks, useUpdateSection } from "../api/hooks";
import type { Task } from "../api/types";
import TaskDetail from "./TaskDetail";
import BoardPageDots from "./BoardPageDots";
import QuickAdd from "./QuickAdd";
import TaskCheckbox from "./TaskCheckbox";
import SectionMenu from "./SectionMenu";
import TaskMenu from "./TaskMenu";
import PriorityMark from "./PriorityMark";
import { PRIORITY_META } from "../utils/priority";
import { dueDateClass, formatDueLabel } from "../utils/date";
import { CalendarIcon, RepeatIcon } from "./icons";
import { stripHtml } from "../utils/html";
import { DEFAULT_DISPLAY_OPTIONS, filterTasks, sortTasks, type DisplayOptions } from "../utils/displayOptions";

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
  display = DEFAULT_DISPLAY_OPTIONS,
}: {
  projectId: string;
  autoOpenTaskId?: string;
  display?: DisplayOptions;
}) {
  const { data } = useBootstrap();
  const reorderTasks = useReorderTasks();
  const createSection = useCreateSection();
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [columns, setColumns] = useState<Column[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoOpenTaskId || !data) return;
    const t = data.tasks.find((x) => x.id === autoOpenTaskId);
    if (t) setOpenTask(t);
  }, [autoOpenTaskId, data]);

  useEffect(() => {
    if (!data) return;
    const sections = data.sections
      .filter((s) => s.projectId === projectId && !s.archived)
      .sort((a, b) => a.order - b.order);
    let allTasks = data.tasks.filter((t) => t.projectId === projectId && !t.parentId);
    if (!display.showCompleted) allTasks = allTasks.filter((t) => !t.completed);
    allTasks = sortTasks(filterTasks(allTasks, display), display);

    const cols: Column[] = sections.map((s) => ({
      key: s.id,
      sectionId: s.id,
      name: s.name,
      tasks: allTasks.filter((t) => t.sectionId === s.id),
    }));

    const unsectioned = allTasks.filter((t) => t.sectionId === null);
    if (unsectioned.length > 0 || sections.length === 0) {
      cols.unshift({
        key: UNSECTIONED,
        sectionId: null,
        name: sections.length === 0 ? "Tasks" : "To-do",
        tasks: unsectioned,
      });
    }
    setColumns(cols);
  }, [data, projectId, display]);

  // Columns arrive a render after the "Add section" column; phone scroll
  // snapping would stay snapped to that one and open on the last page.
  const shownColumns = useRef(false);
  useLayoutEffect(() => {
    if (shownColumns.current || columns.length === 0) return;
    shownColumns.current = true;
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [columns.length]);

  const reorderable = display.sorting === "manual";

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // On touch, dragging needs a long-press so swipes and scrolling still work.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } })
  );

  function findColumnByTaskId(id: string): Column | undefined {
    return columns.find((c) => c.tasks.some((t) => t.id === id));
  }
  function findColumnByKey(key: string): Column | undefined {
    return columns.find((c) => c.key === key);
  }

  function handleDragStart(event: DragStartEvent) {
    if (!reorderable) return;
    const task = columns.flatMap((c) => c.tasks).find((t) => t.id === event.active.id);
    setActiveTask(task || null);
  }

  function handleDragOver(event: DragOverEvent) {
    if (!reorderable) return;
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId || overId.startsWith(DROP_PREFIX)) return;

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
    if (!reorderable || !over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    setColumns((prev) => {
      const next = prev.map((c) => ({ ...c, tasks: [...c.tasks] }));
      const col = next.find((c) => c.tasks.some((t) => t.id === activeId));
      if (col && overId.startsWith(DROP_PREFIX)) {
        // Dropped on a section's name in the strip: to the end of that section.
        const dst = next.find((c) => c.key === overId.slice(DROP_PREFIX.length));
        if (dst && dst.key !== col.key) {
          const idx = col.tasks.findIndex((t) => t.id === activeId);
          const [moved] = col.tasks.splice(idx, 1);
          dst.tasks.push({ ...moved, sectionId: dst.sectionId });
        }
      } else if (col && activeId !== overId) {
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
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
    <div className="board-pager">
      {/* Phones show one section per page: while dragging, drop on a
          section's name here to move the task there. */}
      {activeTask && columns.length > 1 && (
        <div className="board-drop-strip">
          <span>Move to</span>
          {columns.map((c) => (
            <DropChip key={c.key} id={DROP_PREFIX + c.key} label={c.name} />
          ))}
        </div>
      )}
      <div ref={scrollRef} className={`board-scroll ${activeTask ? "is-dragging" : ""}`}>
          <div className="board">
            {columns.map((col) => (
              <BoardColumn key={col.key} column={col} onOpenTask={setOpenTask} projectId={projectId} reorderable={reorderable} />
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
      </div>
      <BoardPageDots scrollRef={scrollRef} count={columns.length + 1} withAdd />
      {openTask && <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onOpenTask={setOpenTask} />}
    </div>
    </DndContext>
  );
}

const DROP_PREFIX = "drop:";

/** The strip's names win when the finger is on one; otherwise the usual nearest card/column. */
const collisionDetection: CollisionDetection = (args) => {
  const onChip = pointerWithin(args).filter((c) => String(c.id).startsWith(DROP_PREFIX));
  return onChip.length ? onChip : closestCorners(args);
};

function DropChip({ id, label }: { id: string; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <span ref={setNodeRef} className={`board-drop-chip ${isOver ? "is-over" : ""}`}>
      {label}
    </span>
  );
}

function BoardColumn({
  column,
  onOpenTask,
  projectId,
  reorderable,
}: {
  column: Column;
  onOpenTask: (task: Task) => void;
  projectId: string;
  reorderable: boolean;
}) {
  const { data } = useBootstrap();
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  const updateSection = useUpdateSection();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(column.name);
  const canRename = column.sectionId !== null;
  const section = column.sectionId ? data?.sections.find((s) => s.id === column.sectionId) : undefined;
  const otherProjects = (data?.projects || []).filter((p) => p.id !== projectId);

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
        {section && (
          <SectionMenu section={section} projects={otherProjects} onRename={() => setRenaming(true)} />
        )}
      </div>
      <div ref={setNodeRef} className="board-column-body">
        <SortableContext items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {column.tasks.map((t) => (
            <BoardCard key={t.id} task={t} onOpen={onOpenTask} reorderable={reorderable} />
          ))}
        </SortableContext>
      </div>
      <QuickAdd projectId={projectId} sectionId={column.sectionId} />
    </div>
  );
}

function BoardCard({
  task,
  onOpen,
  reorderable,
}: {
  task: Task;
  onOpen: (task: Task) => void;
  reorderable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !reorderable,
  });
  const completeTask = useCompleteTask();
  const { data } = useBootstrap();
  const subtasks = (data?.tasks || []).filter((t) => t.parentId === task.id);
  const otherProjects = (data?.projects || []).filter((p) => p.id !== task.projectId);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const priorityColor = PRIORITY_META[task.priority].color;

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
        <div className="board-card-content" style={{ minWidth: 0 }}>
          {task.content}
          {subtasks.length > 0 && (
            <span className="chip" style={{ marginLeft: 8 }}>
              {subtasks.filter((s) => s.completed).length}/{subtasks.length}
            </span>
          )}
          {task.description && (
            <div className="board-card-description">{stripHtml(task.description)}</div>
          )}
          {(task.due || task.labels.length > 0) && (
            <div className="task-meta">
              {task.due && (
                <span className={`due ${dueDateClass(task.due)}`}>
                  <CalendarIcon width={12} height={12} style={{ verticalAlign: "-2px" }} />{" "}
                  {formatDueLabel(task.due)}
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
            </div>
          )}
        </div>
        <PriorityMark priority={task.priority} />
        <TaskMenu task={task} projects={otherProjects} onEdit={() => onOpen(task)} onOpenTask={onOpen} />
      </div>
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
