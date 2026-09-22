import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { fetchAppData, scheduleSave } from "../dropbox/store";
import { advanceDate, parseRecurrenceString } from "../utils/recurrence";
import type { AppData, Due, FilterDef, Label, Priority, Project, Section, Task } from "./types";

const BOOTSTRAP_KEY = ["bootstrap"];

export function useBootstrap() {
  return useQuery({
    queryKey: BOOTSTRAP_KEY,
    queryFn: fetchAppData,
    staleTime: Infinity,
  });
}

function nextOrder(items: { order: number }[]): number {
  return items.reduce((max, i) => Math.max(max, i.order), -1) + 1;
}

/**
 * Applies a synchronous mutation to a deep copy of the cached AppData, writes the
 * result back into the query cache immediately (so the UI updates instantly), and
 * schedules a debounced save to Dropbox.
 */
function useLocalMutation<TInput, TResult>(mutator: (data: AppData, input: TInput) => TResult) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TInput) => {
      const current = qc.getQueryData<AppData>(BOOTSTRAP_KEY) ?? (await fetchAppData());
      const data: AppData = structuredClone(current);
      const result = mutator(data, input);
      qc.setQueryData(BOOTSTRAP_KEY, data);
      scheduleSave(data);
      return result;
    },
  });
}

// ---- tasks ----
export function useCreateTask() {
  return useLocalMutation<Partial<Task> & { content: string }, Task>((data, input) => {
    const {
      content,
      description = "",
      projectId = "inbox",
      sectionId = null,
      parentId = null,
      priority = 1,
      due = null,
      labels = [],
    } = input;
    const now = new Date().toISOString();
    const siblings = data.tasks.filter(
      (t) => t.projectId === projectId && t.sectionId === sectionId && t.parentId === parentId
    );
    const task: Task = {
      id: nanoid(),
      content,
      description,
      projectId,
      sectionId,
      parentId,
      order: nextOrder(siblings),
      priority: priority as Priority,
      due: due as Due | null,
      labels,
      completed: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    data.tasks.push(task);
    return task;
  });
}

export function useUpdateTask() {
  return useLocalMutation<Partial<Task> & { id: string }, Task | null>((data, input) => {
    const { id, ...rest } = input;
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return null;
    Object.assign(task, rest, { updatedAt: new Date().toISOString() });
    return task;
  });
}

export function useCompleteTask() {
  return useLocalMutation<{ id: string; completed: boolean }, Task | null>((data, { id, completed }) => {
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return null;
    if (completed && task.due?.isRecurring && task.due.rrule) {
      const rule = parseRecurrenceString(task.due.rrule);
      if (rule) {
        task.due = { ...task.due, date: advanceDate(task.due.date, rule) };
        task.updatedAt = new Date().toISOString();
        return task;
      }
    }
    task.completed = completed;
    task.completedAt = completed ? new Date().toISOString() : null;
    return task;
  });
}

export function useAddComment() {
  return useLocalMutation<{ taskId: string; text: string }, Task | null>((data, { taskId, text }) => {
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task) return null;
    if (!task.comments) task.comments = [];
    task.comments.push({ id: nanoid(), text, createdAt: new Date().toISOString() });
    task.updatedAt = new Date().toISOString();
    return task;
  });
}

export function useDeleteComment() {
  return useLocalMutation<{ taskId: string; commentId: string }, void>((data, { taskId, commentId }) => {
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task || !task.comments) return;
    task.comments = task.comments.filter((c) => c.id !== commentId);
  });
}

/** Returns the removed task(s) (including descendants) so callers can offer an undo. */
export function useDeleteTask() {
  return useLocalMutation<string, Task[]>((data, id) => {
    const idsToDelete = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of data.tasks) {
        if (t.parentId && idsToDelete.has(t.parentId) && !idsToDelete.has(t.id)) {
          idsToDelete.add(t.id);
          changed = true;
        }
      }
    }
    const removed = data.tasks.filter((t) => idsToDelete.has(t.id));
    data.tasks = data.tasks.filter((t) => !idsToDelete.has(t.id));
    return removed;
  });
}

/** Re-inserts previously removed tasks (from useDeleteTask) with their original ids/relationships. */
export function useRestoreTasks() {
  return useLocalMutation<Task[], void>((data, removed) => {
    const existingIds = new Set(data.tasks.map((t) => t.id));
    for (const t of removed) {
      if (!existingIds.has(t.id)) data.tasks.push(t);
    }
  });
}

/** Batch-applies section/order changes from a board drag-and-drop, in one save. */
export function useReorderTasks() {
  return useLocalMutation<{ id: string; sectionId: string | null; order: number }[], void>((data, updates) => {
    const now = new Date().toISOString();
    for (const u of updates) {
      const task = data.tasks.find((t) => t.id === u.id);
      if (task) {
        task.sectionId = u.sectionId;
        task.order = u.order;
        task.updatedAt = now;
      }
    }
  });
}

/** Batch-sets the due date for a set of tasks in one save, e.g. "reschedule all overdue to today". */
export function useRescheduleTasks() {
  return useLocalMutation<{ ids: string[]; due: Due }, void>((data, { ids, due }) => {
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    data.tasks.forEach((t) => {
      if (idSet.has(t.id)) {
        t.due = due;
        t.updatedAt = now;
      }
    });
  });
}

// ---- projects ----
export function useCreateProject() {
  return useLocalMutation<Partial<Project> & { name: string }, Project>((data, input) => {
    const { name, color = "grey", parentId = null } = input;
    const project: Project = {
      id: nanoid(),
      name,
      color,
      order: nextOrder(data.projects),
      isFavorite: false,
      parentId,
    };
    data.projects.push(project);
    return project;
  });
}

export function useUpdateProject() {
  return useLocalMutation<Partial<Project> & { id: string }, Project | null>((data, input) => {
    const { id, ...rest } = input;
    const project = data.projects.find((p) => p.id === id);
    if (!project) return null;
    Object.assign(project, rest);
    return project;
  });
}

export interface DeletedProject {
  project: Project;
  sections: Section[];
  tasks: Task[];
}

/**
 * Deletes a project along with its sections and tasks, returning them so the
 * caller can offer an undo. Inbox is never deletable.
 */
export function useDeleteProject() {
  return useLocalMutation<string, DeletedProject | null>((data, id) => {
    const project = data.projects.find((p) => p.id === id);
    if (!project || project.isInboxProject) return null;

    const sections = data.sections.filter((s) => s.projectId === id);
    const tasks = data.tasks.filter((t) => t.projectId === id);

    data.projects = data.projects.filter((p) => p.id !== id);
    data.sections = data.sections.filter((s) => s.projectId !== id);
    data.tasks = data.tasks.filter((t) => t.projectId !== id);

    return { project, sections, tasks };
  });
}

export function useRestoreProject() {
  return useLocalMutation<DeletedProject, void>((data, { project, sections, tasks }) => {
    if (!data.projects.some((p) => p.id === project.id)) data.projects.push(project);
    const sectionIds = new Set(data.sections.map((s) => s.id));
    sections.forEach((s) => !sectionIds.has(s.id) && data.sections.push(s));
    const taskIds = new Set(data.tasks.map((t) => t.id));
    tasks.forEach((t) => !taskIds.has(t.id) && data.tasks.push(t));
  });
}

export interface ImportProjectInput {
  projectName: string;
  color?: string;
  sections: string[];
  tasks: {
    content: string;
    description: string;
    priority: Priority;
    due: Due | null;
    indent: number;
    sectionName: string | null;
  }[];
}

/**
 * Creates a whole project (sections + nested tasks) in one write, used by the
 * Todoist CSV importer. Indent levels are resolved to parentId by tracking the
 * most recent task seen at each shallower level.
 */
export function useImportProject() {
  return useLocalMutation<ImportProjectInput, Project>((data, input) => {
    const now = new Date().toISOString();
    const project: Project = {
      id: nanoid(),
      name: input.projectName,
      color: input.color ?? "grape",
      order: nextOrder(data.projects),
      isFavorite: false,
      parentId: null,
    };
    data.projects.push(project);

    const sectionIdByName = new Map<string, string>();
    input.sections.forEach((name, idx) => {
      const section: Section = { id: nanoid(), projectId: project.id, name, order: idx };
      data.sections.push(section);
      sectionIdByName.set(name, section.id);
    });

    // lastAtIndent[n] holds the id of the most recent task at indent level n.
    const lastAtIndent = new Map<number, string>();
    let order = 0;

    for (const t of input.tasks) {
      const id = nanoid();
      const parentId = t.indent > 1 ? lastAtIndent.get(t.indent - 1) ?? null : null;
      data.tasks.push({
        id,
        content: t.content,
        description: t.description,
        projectId: project.id,
        sectionId: t.sectionName ? sectionIdByName.get(t.sectionName) ?? null : null,
        parentId,
        order: order++,
        priority: t.priority,
        due: t.due,
        labels: [],
        completed: false,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      lastAtIndent.set(t.indent, id);
      // A new task at this level invalidates any deeper levels beneath it.
      [...lastAtIndent.keys()].filter((k) => k > t.indent).forEach((k) => lastAtIndent.delete(k));
    }

    return project;
  });
}

// ---- sections ----
export function useCreateSection() {
  return useLocalMutation<Partial<Section> & { name: string; projectId: string }, Section>((data, input) => {
    const { name, projectId } = input;
    const section: Section = {
      id: nanoid(),
      projectId,
      name,
      order: nextOrder(data.sections.filter((s) => s.projectId === projectId)),
    };
    data.sections.push(section);
    return section;
  });
}

export function useUpdateSection() {
  return useLocalMutation<Partial<Section> & { id: string }, Section | null>((data, input) => {
    const { id, ...rest } = input;
    const section = data.sections.find((s) => s.id === id);
    if (!section) return null;
    Object.assign(section, rest);
    return section;
  });
}

export interface DeletedSection {
  section: Section;
  tasks: Task[];
}

/** Deletes a section along with its tasks (and their sub-tasks), returning them for undo. */
export function useDeleteSection() {
  return useLocalMutation<string, DeletedSection | null>((data, id) => {
    const section = data.sections.find((s) => s.id === id);
    if (!section) return null;

    const directIds = new Set(data.tasks.filter((t) => t.sectionId === id).map((t) => t.id));
    // Sub-tasks default to their parent's section, but a sub-task's own sectionId
    // is what we actually stored, so this only needs one pass -- not a project
    // delete's whole-tree walk, since a sub-task can't reference a task outside
    // this section as its parent without also being in a different section itself.
    const tasks = data.tasks.filter((t) => directIds.has(t.id));

    data.sections = data.sections.filter((s) => s.id !== id);
    data.tasks = data.tasks.filter((t) => !directIds.has(t.id));

    return { section, tasks };
  });
}

export function useRestoreSection() {
  return useLocalMutation<DeletedSection, void>((data, { section, tasks }) => {
    if (!data.sections.some((s) => s.id === section.id)) data.sections.push(section);
    const taskIds = new Set(data.tasks.map((t) => t.id));
    tasks.forEach((t) => !taskIds.has(t.id) && data.tasks.push(t));
  });
}

/** Duplicates a section: a new section plus copies of all its tasks (new ids, same content). */
export function useDuplicateSection() {
  return useLocalMutation<string, Section | null>((data, id) => {
    const section = data.sections.find((s) => s.id === id);
    if (!section) return null;

    const newSection: Section = {
      id: nanoid(),
      projectId: section.projectId,
      name: `${section.name} (copy)`,
      order: nextOrder(data.sections.filter((s) => s.projectId === section.projectId)),
    };
    data.sections.push(newSection);

    const original = data.tasks.filter((t) => t.sectionId === id && !t.parentId);
    const now = new Date().toISOString();
    original.forEach((t) => {
      data.tasks.push({
        ...t,
        id: nanoid(),
        sectionId: newSection.id,
        completed: false,
        completedAt: null,
        comments: undefined,
        createdAt: now,
        updatedAt: now,
      });
    });

    return newSection;
  });
}

/** Moves a section, and all its tasks, to a different project. */
export function useMoveSection() {
  return useLocalMutation<{ id: string; projectId: string }, Section | null>((data, { id, projectId }) => {
    const section = data.sections.find((s) => s.id === id);
    if (!section) return null;
    section.projectId = projectId;
    section.order = nextOrder(data.sections.filter((s) => s.projectId === projectId && s.id !== id));
    data.tasks.forEach((t) => {
      if (t.sectionId === id) t.projectId = projectId;
    });
    return section;
  });
}

// ---- labels ----
export function useCreateLabel() {
  return useLocalMutation<Partial<Label> & { name: string }, Label>((data, input) => {
    const { name, color = "grey" } = input;
    const label: Label = { id: nanoid(), name, color, order: nextOrder(data.labels), isFavorite: false };
    data.labels.push(label);
    return label;
  });
}

export function useUpdateLabel() {
  return useLocalMutation<Partial<Label> & { id: string }, Label | null>((data, input) => {
    const { id, ...rest } = input;
    const label = data.labels.find((l) => l.id === id);
    if (!label) return null;
    const previousName = label.name;
    Object.assign(label, rest);
    // Tasks reference labels by name, so a rename has to be carried across them.
    if (rest.name && rest.name !== previousName) {
      data.tasks.forEach((t) => {
        t.labels = t.labels.map((n) => (n === previousName ? label.name : n));
      });
    }
    return label;
  });
}

export interface DeletedLabel {
  label: Label;
  /** Ids of tasks the label was stripped from, so an undo can re-tag them. */
  taskIds: string[];
}

export function useDeleteLabel() {
  return useLocalMutation<string, DeletedLabel | null>((data, id) => {
    const label = data.labels.find((l) => l.id === id);
    if (!label) return null;
    data.labels = data.labels.filter((l) => l.id !== id);
    const taskIds: string[] = [];
    data.tasks.forEach((t) => {
      if (t.labels.includes(label.name)) {
        taskIds.push(t.id);
        t.labels = t.labels.filter((n) => n !== label.name);
      }
    });
    return { label, taskIds };
  });
}

export function useRestoreLabel() {
  return useLocalMutation<DeletedLabel, void>((data, { label, taskIds }) => {
    if (!data.labels.some((l) => l.id === label.id)) data.labels.push(label);
    const ids = new Set(taskIds);
    data.tasks.forEach((t) => {
      if (ids.has(t.id) && !t.labels.includes(label.name)) t.labels.push(label.name);
    });
  });
}

// ---- filters ----
export function useCreateFilter() {
  return useLocalMutation<Partial<FilterDef> & { name: string; query: string }, FilterDef>((data, input) => {
    const { name, query, color = "grey" } = input;
    const filter: FilterDef = { id: nanoid(), name, query, color, order: nextOrder(data.filters), isFavorite: false };
    data.filters.push(filter);
    return filter;
  });
}

export function useUpdateFilter() {
  return useLocalMutation<Partial<FilterDef> & { id: string }, FilterDef | null>((data, input) => {
    const { id, ...rest } = input;
    const filter = data.filters.find((f) => f.id === id);
    if (!filter) return null;
    Object.assign(filter, rest);
    return filter;
  });
}

export function useDeleteFilter() {
  return useLocalMutation<string, FilterDef | null>((data, id) => {
    const filter = data.filters.find((f) => f.id === id);
    if (!filter) return null;
    data.filters = data.filters.filter((f) => f.id !== id);
    return filter;
  });
}

export function useRestoreFilter() {
  return useLocalMutation<FilterDef, void>((data, filter) => {
    if (!data.filters.some((f) => f.id === filter.id)) data.filters.push(filter);
  });
}
