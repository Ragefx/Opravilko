import { useSyncExternalStore } from "react";

/**
 * Simple (Settings > Appearance): one switch that hides the extras someone
 * new to task apps doesn't need, each of which can be brought back on its
 * own. Kept per device, like the other look settings, so one phone can be
 * simple and the other not.
 */
export type SimpleItem =
  | "meals"
  | "shops"
  | "shopReminder"
  | "suggestions"
  | "deadline"
  | "labels"
  | "location"
  | "midvaFrom"
  | "nowNext"
  | "completed";

export const SIMPLE_ITEMS: { key: SimpleItem; label: string }[] = [
  { key: "meals", label: "Shopping: the Meal button" },
  { key: "shops", label: "Shopping: the Shop button" },
  { key: "shopReminder", label: "Shopping: Remind me at the shop" },
  { key: "suggestions", label: "Shopping: suggested items" },
  { key: "deadline", label: "Task: deadline" },
  { key: "labels", label: "Task: labels" },
  { key: "location", label: "Task: location" },
  { key: "midvaFrom", label: "Midva: who a task is from" },
  { key: "nowNext", label: "Now: “pick something from Next” when the day is free" },
  { key: "completed", label: "Menu: Completed" },
];

const ON_KEY = "opravilko.simple";
const SHOWN_KEY = "opravilko.simpleShown";
const listeners = new Set<() => void>();
let version = 0;

function read(): { on: boolean; shown: SimpleItem[] } {
  try {
    const shown = JSON.parse(localStorage.getItem(SHOWN_KEY) || "[]");
    return { on: localStorage.getItem(ON_KEY) === "1", shown: Array.isArray(shown) ? shown : [] };
  } catch {
    return { on: false, shown: [] };
  }
}

function changed() {
  version++;
  listeners.forEach((l) => l());
}

export function setSimple(on: boolean): void {
  try {
    localStorage.setItem(ON_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  changed();
}

/** Brings one hidden thing back (or hides it again) while Simple is on. */
export function setSimpleShown(item: SimpleItem, shown: boolean): void {
  const { shown: list } = read();
  const next = shown ? [...new Set([...list, item])] : list.filter((k) => k !== item);
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  changed();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Simple's state: whether it's on, and what's been brought back. */
export function useSimple(): { on: boolean; shown: SimpleItem[] } {
  useSyncExternalStore(subscribe, () => version, () => version);
  return read();
}

/** Whether this thing is hidden right now (Simple on, and not brought back). */
export function useHidden(item: SimpleItem): boolean {
  const { on, shown } = useSimple();
  return on && !shown.includes(item);
}
