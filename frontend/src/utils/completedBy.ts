import type { AppData, Task } from "../api/types";

/**
 * Who ticked off a shared task or shopping item: "You", or the other
 * person's first name. Null when it isn't shared or nobody's recorded
 * (ticked off before this was kept, or in Dropbox mode).
 */
export function completedByName(task: Task, data: AppData | undefined): string | null {
  const by = task.completedBy;
  if (!task.completed || !by || !data) return null;
  const project = data.projects.find((p) => p.id === task.projectId);
  const shared = (project?.members?.length ?? 0) > 1 || (task.sharedWith?.length ?? 0) > 0;
  if (!shared) return null;
  if (by === data.me) return "You";
  const name = data.partner?.uid === by ? data.partner.name : project?.memberProfiles?.[by]?.name;
  return name?.split(" ")[0] || null;
}

/**
 * A person on a shared task, by their user id, as the task view names them:
 * "You", or their first name (your partner, someone on the project, or the
 * person who shared the task). Null on a task only you see.
 */
export function personName(by: string | undefined, task: Task, data: AppData | undefined): string | null {
  if (!by || !data) return null;
  const project = data.projects.find((p) => p.id === task.projectId);
  const shared = (project?.members?.length ?? 0) > 1 || (task.sharedWith?.length ?? 0) > 0 || Boolean(task.sharedBy);
  if (!shared) return null;
  if (by === data.me) return "You";
  const name =
    data.partner?.uid === by
      ? data.partner.name
      : (project?.memberProfiles?.[by]?.name ?? (task.sharedBy?.uid === by ? task.sharedBy.name : undefined));
  return name?.split(" ")[0] || null;
}
