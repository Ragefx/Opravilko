import type { AppData } from "../api/types";
import { shoppingListOf } from "./shopping";

/** Somewhere a new task can go: a project, or one of its sections. */
export interface AddTarget {
  key: string;
  projectId: string;
  sectionId: string | null;
  label: string;
}

/**
 * Every place Add task can put a task: each project's sections ("Inbox /
 * To-do", "Inbox / Dogodki"), or the project itself when it has none. The
 * Inbox comes first; the shopping list isn't offered (it takes items).
 */
export function addTargets(data: AppData | undefined): AddTarget[] {
  if (!data) return [{ key: "inbox:", projectId: "inbox", sectionId: null, label: "Inbox" }];
  const shopping = shoppingListOf(data.projects)?.id;
  const projects = data.projects
    .filter((p) => p.id !== shopping)
    .sort((a, b) => Number(!!b.isInboxProject) - Number(!!a.isInboxProject) || a.order - b.order);
  const out: AddTarget[] = [];
  for (const p of projects) {
    const sections = data.sections.filter((s) => s.projectId === p.id && !s.archived).sort((a, b) => a.order - b.order);
    if (!sections.length) out.push({ key: `${p.id}:`, projectId: p.id, sectionId: null, label: p.name });
    for (const s of sections) out.push({ key: `${p.id}:${s.id}`, projectId: p.id, sectionId: s.id, label: `${p.name} / ${s.name}` });
  }
  return out.length ? out : [{ key: "inbox:", projectId: "inbox", sectionId: null, label: "Inbox" }];
}

/** The first place in a project (its first section, or the project itself). */
export function firstTargetIn(targets: AddTarget[], projectId: string): AddTarget {
  return targets.find((t) => t.projectId === projectId) ?? targets[0];
}
