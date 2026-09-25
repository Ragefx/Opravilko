import type { AppData, Task } from "../api/types";

/**
 * What the Calendar page shows: open tasks from the Inbox and every project
 * (shared ones included), leaving out archived sections as project pages do.
 */
export function calendarTasks(data: AppData): Task[] {
  const archivedSections = new Set(data.sections.filter((s) => s.archived).map((s) => s.id));
  return data.tasks.filter((t) => !t.completed && !(t.sectionId && archivedSections.has(t.sectionId)));
}

/** Open tasks due this calendar month -- the count next to "Calendar". */
export function openThisMonth(data: AppData): number {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return calendarTasks(data).filter((t) => t.due?.date.startsWith(ym)).length;
}
