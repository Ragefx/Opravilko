import { tr } from "../i18n";
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
  | "deals"
  | "deadline"
  | "labels"
  | "location"
  | "midvaFrom"
  | "nowNext"
  | "completed"
  | "productivity";

export const SIMPLE_ITEMS: { key: SimpleItem; label: string }[] = [
  { key: "meals", label: tr("Shopping: the Meal button", "Nakupi: gumb Obrok") },
  { key: "shops", label: tr("Shopping: the Shop button", "Nakupi: gumb Trgovina") },
  { key: "shopReminder", label: tr("Shopping: Remind me at the shop", "Nakupi: Opomni me v trgovini") },
  { key: "suggestions", label: tr("Shopping: suggested items", "Nakupi: predlagani artikli") },
  { key: "deals", label: tr("Shopping: On sale (shop deals)", "Nakupi: V akciji (akcije trgovin)") },
  { key: "deadline", label: tr("Task: deadline", "Naloga: rok") },
  { key: "labels", label: tr("Task: labels", "Naloga: oznake") },
  { key: "location", label: tr("Task: location", "Naloga: lokacija") },
  { key: "midvaFrom", label: tr("Midva: who a task is from", "Midva: od koga je naloga") },
  { key: "nowNext", label: tr("Now: “pick something from Next” when the day is free", "Zdaj: »izberi nekaj iz Naslednje«, ko je dan prost") },
  { key: "completed", label: tr("Menu: Completed", "Meni: Opravljeno") },
  { key: "productivity", label: tr("Menu: Productivity", "Meni: Produktivnost") },
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
