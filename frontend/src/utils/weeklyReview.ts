import { useSyncExternalStore } from "react";

/**
 * Whether the weekly review is offered: in the menu, the command palette
 * and on Now at the weekend. On by default; kept per device, like the other look settings.
 */
const STORAGE_KEY = "opravilko.weeklyReview";
const listeners = new Set<() => void>();

export function getWeeklyReview(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setWeeklyReview(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWeeklyReview(): boolean {
  return useSyncExternalStore(subscribe, getWeeklyReview, getWeeklyReview);
}
