import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { fetchAppData, scheduleSave } from "../dropbox/store";
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
    task.completed = completed;
    task.completedAt = completed ? new Date().toISOString() : null;
    return task;
  });
}

export function useDeleteTask() {
  return useLocalMutation<string, void>((data, id) => {
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
    data.tasks = data.tasks.filter((t) => !idsToDelete.has(t.id));
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

export function useDeleteProject() {
  return useLocalMutation<string, void>((data, id) => {
    data.projects = data.projects.filter((p) => p.id !== id && !p.isInboxProject);
    data.sections = data.sections.filter((s) => s.projectId !== id);
    data.tasks = data.tasks.filter((t) => t.projectId !== id);
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

// ---- labels ----
export function useCreateLabel() {
  return useLocalMutation<Partial<Label> & { name: string }, Label>((data, input) => {
    const { name, color = "grey" } = input;
    const label: Label = { id: nanoid(), name, color, order: nextOrder(data.labels), isFavorite: false };
    data.labels.push(label);
    return label;
  });
}

export function useDeleteLabel() {
  return useLocalMutation<string, void>((data, id) => {
    const label = data.labels.find((l) => l.id === id);
    data.labels = data.labels.filter((l) => l.id !== id);
    if (label) {
      data.tasks.forEach((t) => {
        t.labels = t.labels.filter((n) => n !== label.name);
      });
    }
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

export function useDeleteFilter() {
  return useLocalMutation<string, void>((data, id) => {
    data.filters = data.filters.filter((f) => f.id !== id);
  });
}
