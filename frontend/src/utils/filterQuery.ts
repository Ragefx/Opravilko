import type { AppData, Task } from "../api/types";
import { isDueToday, isDueWithinDays, isOverdue } from "./date";

/**
 * A tiny filter query language, inspired by Todoist's: space-separated tokens, ANDed together.
 *   today | overdue | upcoming | p1..p3 | p4 (no priority) | @label | #ProjectName | no date
 */
export function matchesQuery(task: Task, query: string, data: AppData): boolean {
  const tokens = query
    .toLowerCase()
    .replace(/\bno date\b/g, "no_date")
    .split(/\s+/)
    .filter(Boolean);

  return tokens.every((token) => {
    if (token === "today") return isDueToday(task.due);
    if (token === "overdue") return isOverdue(task.due);
    if (token === "upcoming") return isDueWithinDays(task.due, 7);
    if (token === "no_date") return !task.due;
    if (token === "p1") return task.priority === 4;
    if (token === "p2") return task.priority === 3;
    if (token === "p3") return task.priority === 2;
    if (token === "p4") return task.priority === 1;
    if (token.startsWith("@")) return task.labels.some((l) => l.toLowerCase() === token.slice(1));
    if (token.startsWith("#")) {
      const project = data.projects.find((p) => p.name.toLowerCase() === token.slice(1));
      return project ? task.projectId === project.id : false;
    }
    return true;
  });
}
