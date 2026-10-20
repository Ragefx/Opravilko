import { tr } from "../i18n";
import { useSyncExternalStore } from "react";

/**
 * The extras someone new to task apps doesn't need (Settings > What's
 * shown): the mode (utils/mode.ts) hides all of them or none, and each can
 * be shown or hidden on its own. Kept per device, so one phone can be
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
  { key: "nowNext", label: tr("Now: status message (“Nothing due today…”)", "Zdaj: sporočilo o stanju (»Danes ni nič na sporedu …«)") },
  { key: "completed", label: tr("Menu: Completed", "Meni: Opravljeno") },
  { key: "productivity", label: tr("Menu: Productivity", "Meni: Produktivnost") },
];

/** What's hidden on this device (a JSON list); set by the mode, changed one by one. */
const HIDDEN_KEY = "opravilko.hidden";
// Before the modes: one Simple switch, plus what was brought back while it was on.
const OLD_ON_KEY = "opravilko.simple";
const OLD_SHOWN_KEY = "opravilko.simpleShown";
const ALL = SIMPLE_ITEMS.map((i) => i.key);
const listeners = new Set<() => void>();
let version = 0;

function read(): SimpleItem[] {
  try {
    const saved = localStorage.getItem(HIDDEN_KEY);
    if (saved !== null) {
      const list = JSON.parse(saved);
      return Array.isArray(list) ? list.filter((k): k is SimpleItem => ALL.includes(k)) : [];
    }
    if (localStorage.getItem(OLD_ON_KEY) !== "1") return [];
    const shown = JSON.parse(localStorage.getItem(OLD_SHOWN_KEY) || "[]");
    return ALL.filter((k) => !(Array.isArray(shown) && shown.includes(k)));
  } catch {
    return [];
  }
}

function changed() {
  version++;
  listeners.forEach((l) => l());
}

/** Hides exactly these (a mode picked), showing the rest. */
export function setHiddenItems(items: SimpleItem[]): void {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
  changed();
}

/** Shows one thing again, or hides it. */
export function setShown(item: SimpleItem, shown: boolean): void {
  const list = read();
  setHiddenItems(shown ? list.filter((k) => k !== item) : [...new Set([...list, item])]);
}

/** Whether Simple was on before the modes came (to pick Bebika for this device). */
export function wasSimple(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === null && localStorage.getItem(OLD_ON_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Everything hidden on this device right now. */
export function useHiddenItems(): SimpleItem[] {
  useSyncExternalStore(subscribe, () => version, () => version);
  return read();
}

/** Everything hidden right now (for the phone's widget, which follows it too). */
export function simpleHidden(): SimpleItem[] {
  return read();
}

/** Whether this thing is hidden right now. */
export function useHidden(item: SimpleItem): boolean {
  return useHiddenItems().includes(item);
}
