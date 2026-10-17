import { useSyncExternalStore } from "react";
import { tr } from "../i18n";
import { SIMPLE_ITEMS, setHiddenItems, wasSimple } from "./simple";
import { setFocusCard } from "./focusCard";
import { setWeeklyReview } from "./weeklyReview";
import { setCalendarDoneOn } from "./calendarDone";
import { setHolidaysOn } from "./holidays";
import { setSwipeTasks } from "./swipeTasks";

/**
 * Bebek or Bebika (Settings > What's shown, and asked once on each device):
 * a starting point for this device's switches. Bebek has everything on;
 * Bebika the simplest app (every extra hidden, no focus task, weekly review,
 * completed tasks on the calendar or swiping; the holidays stay). Each
 * switch can still be changed afterwards.
 */
export type Mode = "bebek" | "bebika";

const KEY = "opravilko.mode";
const listeners = new Set<() => void>();

export const MODES: { id: Mode; name: string; blurb: string }[] = [
  { id: "bebek", name: "Bebek", blurb: tr("Everything on: all the extras and helpers.", "Vse vklopljeno: vsi dodatki in pomočniki.") },
  { id: "bebika", name: "Bebika", blurb: tr("The simplest app: just tasks, shopping and the calendar.", "Najpreprostejša aplikacija: samo naloge, nakupi in koledar.") },
];

/** The mode picked on this device, or null if nobody has picked one yet. */
export function getMode(): Mode | null {
  try {
    const m = localStorage.getItem(KEY);
    return m === "bebek" || m === "bebika" ? m : null;
  } catch {
    return null;
  }
}

/** Picks a mode: every switch it covers is set to its value. */
export function setMode(mode: Mode): void {
  const all = mode === "bebek";
  setHiddenItems(all ? [] : SIMPLE_ITEMS.map((i) => i.key));
  setFocusCard(all);
  setWeeklyReview(all);
  setCalendarDoneOn(all);
  setHolidaysOn(true);
  setSwipeTasks(all);
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

/** For the one-time question: Bebika if this device had Simple on, else Bebek. */
export function suggestedMode(): Mode {
  return wasSimple() ? "bebika" : "bebek";
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useMode(): Mode | null {
  return useSyncExternalStore(subscribe, getMode, getMode);
}
