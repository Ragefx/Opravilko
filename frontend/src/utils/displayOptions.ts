import type { Priority, Task } from "../api/types";
import { PRIORITY_META } from "./priority";
import { formatDueLabel, isDueToday, isDueWithinDays, isOverdue } from "./date";

export type Layout = "list" | "board" | "calendar";
export type Grouping = "none" | "priority" | "label" | "dueDate";
export type Sorting = "manual" | "date" | "priority" | "name" | "created";
export type Direction = "asc" | "desc";
export type DateFilter = "all" | "today" | "overdue" | "upcoming" | "noDate";
export type PriorityFilter = "all" | Priority;

export interface DisplayOptions {
  layout: Layout;
  showCompleted: boolean;
  grouping: Grouping;
  sorting: Sorting;
  direction: Direction;
  filterDate: DateFilter;
  filterPriority: PriorityFilter;
  filterLabel: string; // "all" or a label name
}

export const DEFAULT_DISPLAY_OPTIONS: DisplayOptions = {
  layout: "list",
  showCompleted: false,
  grouping: "none",
  sorting: "manual",
  direction: "asc",
  filterDate: "all",
  filterPriority: "all",
  filterLabel: "all",
};

export function filterTasks(tasks: Task[], opts: DisplayOptions): Task[] {
  return tasks.filter((t) => {
    if (opts.filterPriority !== "all" && t.priority !== opts.filterPriority) return false;
    if (opts.filterLabel !== "all" && !t.labels.includes(opts.filterLabel)) return false;
    if (opts.filterDate !== "all") {
      if (opts.filterDate === "noDate") return !t.due;
      if (opts.filterDate === "today") return isDueToday(t.due);
      if (opts.filterDate === "overdue") return isOverdue(t.due);
      if (opts.filterDate === "upcoming") return isDueWithinDays(t.due, 14);
    }
    return true;
  });
}

export function sortTasks(tasks: Task[], opts: DisplayOptions): Task[] {
  const arr = [...tasks];
  if (opts.sorting === "manual") {
    arr.sort((a, b) => a.order - b.order);
    return arr;
  }
  const dir = opts.direction === "desc" ? -1 : 1;
  switch (opts.sorting) {
    case "date":
      arr.sort((a, b) => dir * (a.due?.date || "9999-99-99").localeCompare(b.due?.date || "9999-99-99"));
      break;
    case "priority":
      arr.sort((a, b) => dir * (b.priority - a.priority));
      break;
    case "name":
      arr.sort((a, b) => dir * a.content.localeCompare(b.content));
      break;
    case "created":
      arr.sort((a, b) => dir * a.createdAt.localeCompare(b.createdAt));
      break;
  }
  return arr;
}

export function groupKeyFor(t: Task, grouping: Grouping): string {
  switch (grouping) {
    case "priority":
      return PRIORITY_META[t.priority].label;
    case "label":
      return t.labels[0] || "No label";
    case "dueDate":
      return t.due ? formatDueLabel(t.due) : "No date";
    default:
      return "";
  }
}
