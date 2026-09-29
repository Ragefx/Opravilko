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

/**
 * Who wrote a comment: their first name and Google picture. Yourself too, by
 * name ("Željko", not "You"), so a shared task reads the same on both phones.
 */
export function commentAuthor(
  by: string | undefined,
  task: Task,
  data: AppData | undefined,
  me: { name?: string | null; photo?: string | null } | null
): { name: string; photo: string | null } | null {
  if (!data) return null;
  const project = data.projects.find((p) => p.id === task.projectId);
  // Older comments don't say whose they are: on a task only you see, they're yours.
  if (!by) {
    const shared = (project?.members?.length ?? 0) > 1 || (task.sharedWith?.length ?? 0) > 0 || Boolean(task.sharedBy);
    if (shared || !data.me) return null;
    by = data.me;
  }
  const person =
    by === data.me
      ? { name: me?.name ?? "", photo: me?.photo ?? null }
      : data.partner?.uid === by
        ? { name: data.partner.name, photo: data.partner.photo ?? null }
        : project?.memberProfiles?.[by]
          ? { name: project.memberProfiles[by].name, photo: project.memberProfiles[by].photo ?? null }
          : task.sharedBy?.uid === by
            ? { name: task.sharedBy.name, photo: task.sharedBy.photo ?? null }
            : null;
  const first = person?.name.split(" ")[0];
  return first ? { name: first, photo: person!.photo } : null;
}
