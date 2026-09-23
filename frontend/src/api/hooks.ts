import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { addDays, addMonths, differenceInCalendarDays, parseISO, subMonths } from "date-fns";
import { fetchAppData, scheduleSave } from "../data/store";
import { advanceDate, parseRecurrenceString } from "../utils/recurrence";
import { todayISO } from "../utils/date";
import { fetchIcsText, NoConnectionError } from "../utils/calendarSync";
import { parseIcs } from "../utils/ics";
import type {
  AppData,
  Attachment,
  CalendarEvent,
  CalendarFeed,
  Due,
  FilterDef,
  Label,
  Priority,
  Project,
  Section,
  Task,
} from "./types";

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
 * Tasks reference labels by name, so a label typed in quick add ("@errands")
 * or the detail panel needs a matching Label record to show up in the
 * sidebar. Reuses an existing label's exact casing when one matches.
 */
function ensureLabels(data: AppData, names: string[]): string[] {
  return names.map((name) => {
    const existing = data.labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.name;
    data.labels.push({ id: nanoid(), name, color: "grey", order: nextOrder(data.labels), isFavorite: false });
    return name;
  });
}

const COMPLETION_LOG_LIMIT = 5000;

function logCompletion(data: AppData, task: Task, at: string): void {
  if (!data.completionLog) data.completionLog = [];
  data.completionLog.push({ taskId: task.id, projectId: task.projectId, content: task.content, at });
  if (data.completionLog.length > COMPLETION_LOG_LIMIT) {
    data.completionLog = data.completionLog.slice(-COMPLETION_LOG_LIMIT);
  }
}

/** Drops a task's most recent completion entry, for un-completing or undo. */
function unlogCompletion(data: AppData, taskId: string): void {
  const log = data.completionLog;
  if (!log) return;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].taskId === taskId) {
      log.splice(i, 1);
      return;
    }
  }
}

/** Every descendant of a task (sub-tasks, their sub-tasks, ...). */
function descendantIds(tasks: Task[], rootId: string): Set<string> {
  const ids = new Set<string>();
  let frontier = [rootId];
  while (frontier.length) {
    const next: string[] = [];
    for (const t of tasks) {
      if (t.parentId && frontier.includes(t.parentId) && !ids.has(t.id)) {
        ids.add(t.id);
        next.push(t.id);
      }
    }
    frontier = next;
  }
  return ids;
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
      scheduleSave(data, current);
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
    // A sub-task of a shared task is shared too.
    const parent = parentId ? data.tasks.find((t) => t.id === parentId) : undefined;
    const sharedWith = input.sharedWith?.length ? input.sharedWith : parent?.sharedWith?.length ? parent.sharedWith : undefined;
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
      labels: ensureLabels(data, labels),
      completed: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      ...(sharedWith ? { sharedWith } : {}),
    };
    data.tasks.push(task);
    return task;
  });
}

/** Adds uploaded files to a task (see firebase/attachments.ts for the upload). */
export function useAddAttachments() {
  return useLocalMutation<{ id: string; attachments: Attachment[] }, void>((data, { id, attachments }) => {
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return;
    task.attachments = [...(task.attachments || []), ...attachments];
    task.updatedAt = new Date().toISOString();
  });
}

/** Takes a file off its task; the stored file is deleted shortly after. */
export function useRemoveAttachment() {
  return useLocalMutation<{ taskId: string; attachmentId: string }, void>((data, { taskId, attachmentId }) => {
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task?.attachments) return;
    task.attachments = task.attachments.filter((a) => a.id !== attachmentId);
    if (task.attachments.length === 0) delete task.attachments;
    task.updatedAt = new Date().toISOString();
  });
}

/** Shares a task (and its sub-tasks) with your partner, or makes it private again. */
export function useSetTaskShared() {
  return useLocalMutation<{ id: string; shared: boolean }, void>((data, { id, shared }) => {
    const partner = data.partner;
    if (shared && !partner) return;
    const ids = new Set([id, ...descendantIds(data.tasks, id)]);
    const now = new Date().toISOString();
    for (const t of data.tasks) {
      if (!ids.has(t.id)) continue;
      if (shared) t.sharedWith = [partner!.uid];
      else delete t.sharedWith;
      t.updatedAt = now;
    }
  });
}

export function useUpdateTask() {
  return useLocalMutation<Partial<Task> & { id: string }, Task | null>((data, input) => {
    const { id, ...rest } = input;
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return null;
    if (rest.labels) rest.labels = ensureLabels(data, rest.labels);
    Object.assign(task, rest, { updatedAt: new Date().toISOString() });
    return task;
  });
}

/**
 * Moves a recurring task to its next occurrence. Missed occurrences are
 * skipped rather than stepped through one completion at a time, and a set
 * time moves along with the date (reminders key off the datetime).
 */
function advanceRecurringDue(due: Due): Due | null {
  const rule = parseRecurrenceString(due.rrule);
  if (!rule) return null;
  const today = todayISO();
  let next = advanceDate(due.date, rule);
  while (next < today) next = advanceDate(next, rule);
  let datetime = due.datetime;
  if (datetime) {
    const dayShift = differenceInCalendarDays(parseISO(next), parseISO(due.date));
    datetime = addDays(new Date(datetime), dayShift).toISOString();
  }
  return { ...due, date: next, datetime };
}

export function useCompleteTask() {
  return useLocalMutation<{ id: string; completed: boolean }, Task | null>((data, { id, completed }) => {
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return null;
    const now = new Date().toISOString();
    if (completed && task.due?.isRecurring && task.due.rrule) {
      const nextDue = advanceRecurringDue(task.due);
      if (nextDue) {
        task.due = nextDue;
        task.updatedAt = now;
        logCompletion(data, task, now);
        return task;
      }
    }
    if (completed && !task.completed) logCompletion(data, task, now);
    if (!completed && task.completed) unlogCompletion(data, id);
    task.completed = completed;
    task.completedAt = completed ? now : null;
    task.updatedAt = now;
    // Completing a task closes its open sub-tasks too, like Todoist; otherwise
    // they'd linger as orphans in Today/Upcoming. Un-completing leaves them be.
    if (completed) {
      const childIds = descendantIds(data.tasks, id);
      for (const t of data.tasks) {
        if (childIds.has(t.id) && !t.completed) {
          t.completed = true;
          t.completedAt = now;
          t.updatedAt = now;
          logCompletion(data, t, now);
        }
      }
    }
    return task;
  });
}

/** Undoes completing a repeating task: puts its due date back and drops the log entry. */
export function useRevertRecurringCompletion() {
  return useLocalMutation<{ id: string; due: Due | null }, void>((data, { id, due }) => {
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return;
    task.due = due;
    task.updatedAt = new Date().toISOString();
    unlogCompletion(data, id);
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
  /** Sub-projects moved up a level on delete, restored under it on undo. */
  childIds?: string[];
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

    // Sub-projects aren't deleted with their parent; they move up a level.
    const childIds: string[] = [];
    for (const p of data.projects) {
      if (p.parentId === id) {
        p.parentId = project.parentId;
        childIds.push(p.id);
      }
    }

    data.projects = data.projects.filter((p) => p.id !== id);
    data.sections = data.sections.filter((s) => s.projectId !== id);
    data.tasks = data.tasks.filter((t) => t.projectId !== id);

    return { project, sections, tasks, childIds };
  });
}

export function useRestoreProject() {
  return useLocalMutation<DeletedProject, void>((data, { project, sections, tasks, childIds = [] }) => {
    if (!data.projects.some((p) => p.id === project.id)) data.projects.push(project);
    const children = new Set(childIds);
    data.projects.forEach((p) => {
      if (children.has(p.id)) p.parentId = project.id;
    });
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

// ---- calendar feeds (read-only external .ics subscriptions) ----

export function useCreateCalendarFeed() {
  return useLocalMutation<{ name: string; url: string; color?: string }, CalendarFeed>((data, input) => {
    if (!data.calendarFeeds) data.calendarFeeds = [];
    const feed: CalendarFeed = {
      id: nanoid(),
      name: input.name,
      url: input.url,
      color: input.color || "#7048e8",
      enabled: true,
      lastSyncedAt: null,
      lastError: null,
    };
    data.calendarFeeds.push(feed);
    return feed;
  });
}

export function useUpdateCalendarFeed() {
  return useLocalMutation<Partial<CalendarFeed> & { id: string }, void>((data, input) => {
    const { id, ...rest } = input;
    const feed = data.calendarFeeds?.find((f) => f.id === id);
    if (feed) Object.assign(feed, rest);
  });
}

export function useDeleteCalendarFeed() {
  return useLocalMutation<string, void>((data, id) => {
    data.calendarFeeds = (data.calendarFeeds || []).filter((f) => f.id !== id);
    data.calendarEvents = (data.calendarEvents || []).filter((e) => e.feedId !== id);
  });
}

/**
 * Fetches one feed's .ics text (through the CORS proxy), parses it, and
 * replaces that feed's cached events -- shared by the per-feed manual
 * refresh mutation and the bulk auto-sync run on load, so both apply the
 * exact same window and merge logic.
 */
async function runFeedSync(qc: QueryClient, feedId: string, manual = true): Promise<void> {
  const current = qc.getQueryData<AppData>(BOOTSTRAP_KEY) ?? (await fetchAppData());
  const feed = current.calendarFeeds?.find((f) => f.id === feedId);
  if (!feed) throw new Error("Calendar not found");

  const windowStart = subMonths(new Date(), 1);
  const windowEnd = addMonths(new Date(), 12);

  let events: CalendarEvent[] = [];
  let error: string | null = null;
  try {
    const text = await fetchIcsText(feed.url);
    events = parseIcs(text, feedId, feed.color, windowStart, windowEnd);
  } catch (e) {
    // No connection at all (e.g. a laptop waking from sleep): the feed is
    // fine, so an automatic sync keeps its events and error as they were and
    // tries again later instead of saving a scary error.
    if (e instanceof NoConnectionError && !manual) throw e;
    error = e instanceof Error ? e.message : "Sync failed";
  }

  const latest = qc.getQueryData<AppData>(BOOTSTRAP_KEY) ?? current;
  const data: AppData = structuredClone(latest);
  const f = data.calendarFeeds?.find((x) => x.id === feedId);
  const previousEvents = (data.calendarEvents || []).filter((e) => e.feedId === feedId);
  // Only a changed feed (new/moved events, or a new error) is worth a Dropbox
  // write. Syncing runs on every load and hourly, so writing unconditionally
  // meant constant uploads, and with two devices open, needless conflicts.
  const changed =
    (f?.lastError ?? null) !== error || (!error && JSON.stringify(previousEvents) !== JSON.stringify(events));
  if (f) {
    f.lastSyncedAt = new Date().toISOString();
    f.lastError = error;
  }
  if (!error) {
    data.calendarEvents = [...(data.calendarEvents || []).filter((e) => e.feedId !== feedId), ...events];
  }
  qc.setQueryData(BOOTSTRAP_KEY, data);
  if (changed) scheduleSave(data, latest);
  if (error) throw new Error(error);
}

/** Manual per-feed refresh, with mutation state (isPending/error) for the Calendars UI. */
export function useSyncCalendarFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (feedId: string) => runFeedSync(qc, feedId),
  });
}

/**
 * Syncs every enabled feed in turn -- called once on load and periodically
 * while open. Resolves to false if there was no connection, so the caller
 * can try again soon.
 */
export function useSyncAllCalendarFeeds() {
  const qc = useQueryClient();
  return async (): Promise<boolean> => {
    const current = qc.getQueryData<AppData>(BOOTSTRAP_KEY) ?? (await fetchAppData());
    const feeds = (current.calendarFeeds || []).filter((f) => f.enabled);
    for (const feed of feeds) {
      try {
        await runFeedSync(qc, feed.id, false);
      } catch (e) {
        if (e instanceof NoConnectionError) return false;
        /* other errors are stored on the feed itself (lastError) */
      }
    }
    return true;
  };
}
